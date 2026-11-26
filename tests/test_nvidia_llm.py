import io
import json
import sys
import threading
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import nvidia_llm as nl


def test_api_keys_only_underscore_form():
    env = {"NVIDIA_API_KEY": "a", "NVIDIA_API_KEY_2": "b", "NVIDIA_API_KEY3": "c", "NVIDIA_API_KEY_4": "d"}
    assert nl.api_keys(env) == ["a", "b", "d"]
    assert nl.api_keys({}) == []


def test_strip_thinking():
    assert nl.strip_thinking("<think>생각\n여러 줄</think>\n판정: 사자") == "판정: 사자"
    assert nl.strip_thinking(None) == ""


class _Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


def _ok(text):
    return _Resp(json.dumps({"choices": [{"message": {"content": text}}]}).encode())


def _http_error(code):
    return urllib.error.HTTPError("http://x", code, "err", {}, io.BytesIO(b"limit"))


def test_rotates_to_next_key_on_429_and_remembers_it():
    seen = []

    def opener(req, timeout):
        auth = req.get_header("Authorization")
        seen.append(auth)
        if auth == "Bearer k1":
            raise _http_error(429)
        return _ok("<think>x</think>판정: 중립")

    llm = nl.make_llm(env={"NVIDIA_API_KEY": "k1", "NVIDIA_API_KEY_2": "k2"}, opener=opener)
    assert llm("hi") == "판정: 중립"
    assert seen == ["Bearer k1", "Bearer k2"]
    seen.clear()
    llm("again")                        # 성공한 두 번째 키부터 시작
    assert seen == ["Bearer k2"]


def test_all_keys_blocked_raises_without_leaking_key():
    llm = nl.make_llm(env={"NVIDIA_API_KEY": "secret-key"}, opener=lambda r, timeout: (_ for _ in ()).throw(_http_error(401)))
    with pytest.raises(nl.NvidiaError) as e:
        llm("hi")
    assert "401" in str(e.value) and "secret-key" not in str(e.value)


def test_other_http_error_and_network_error_and_empty_answer():
    def fail(code):
        return nl.make_llm(env={"NVIDIA_API_KEY": "k"}, opener=lambda r, timeout: (_ for _ in ()).throw(_http_error(500)))
    with pytest.raises(nl.NvidiaError, match="500"):
        fail(500)("hi")
    net = nl.make_llm(env={"NVIDIA_API_KEY": "k"}, opener=lambda r, timeout: (_ for _ in ()).throw(urllib.error.URLError("dns")))
    with pytest.raises(nl.NvidiaError, match="연결 실패"):
        net("hi")
    empty = nl.make_llm(env={"NVIDIA_API_KEY": "k"}, opener=lambda r, timeout: _ok("<think>only</think>"))
    with pytest.raises(nl.NvidiaError, match="빈 답"):
        empty("hi")


def test_no_key_raises_clear_error():
    with pytest.raises(nl.NvidiaError, match="NVIDIA_API_KEY"):
        nl.make_llm(env={})("hi")


def test_real_http_roundtrip_against_local_server():
    got = {}

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["content-length"])))
            got.update(body=body, auth=self.headers["authorization"])
            out = json.dumps({"choices": [{"message": {"content": "판정: 사자\n확신도: 70"}}]}).encode()
            self.send_response(200); self.send_header("content-length", str(len(out))); self.end_headers(); self.wfile.write(out)
        def log_message(self, *a): pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        env = {"NVIDIA_API_KEY": "k", "NVIDIA_ENDPOINT": f"http://127.0.0.1:{srv.server_port}/v1/chat/completions", "NVIDIA_MODEL": "m/x"}
        assert nl.make_llm(env=env)("프롬프트") == "판정: 사자\n확신도: 70"
    finally:
        srv.shutdown()
    assert got["auth"] == "Bearer k" and got["body"]["model"] == "m/x" and got["body"]["messages"][0]["content"] == "프롬프트"


def test_works_as_llm_for_investor_advisor():
    import investor_advisor as ia
    answers = iter(['{"type": "stock", "targets": ["삼성전자"]}'] + ["판정: 사자\n확신도: 80\n이유:\n1. a\n2. b\n3. c"] * 4)
    llm = nl.make_llm(env={"NVIDIA_API_KEY": "k"}, opener=lambda r, timeout: _ok(next(answers)))
    text = "\n".join(ia.run_stock_command("삼성전자", llm))
    assert "삼성전자 — 투자자 4인 의견" in text and "🟢 사자 4" in text
