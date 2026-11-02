import asyncio
import base64
import ctypes
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

from aiohttp import ClientSession, ClientTimeout, web


AUTHORIZATION_ENDPOINT = "https://auth.openai.com/api/accounts/authorize"
TOKEN_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/token"
OPENID_CONFIGURATION_URL = "https://auth.openai.com/.well-known/openid-configuration"
OPENAI_RESOURCE = "https://api.openai.com/v1"
OPENAI_MODELS_URL = f"{OPENAI_RESOURCE}/models"
OPENAI_RESPONSES_URL = f"{OPENAI_RESOURCE}/responses"
REQUIRED_SCOPE = "chatgpt.tokens.use.direct"
REQUESTED_SCOPES = (
    "openid profile email offline_access resource.invoke "
    "chatgpt.tokens.use.direct"
)
AGENT_NAME = "ComfyUI Styler Pipeline"
CALLBACK_PATH = "/pipeline_control/chatgpt/callback"
MODEL_ID_RE = re.compile(r"^[A-Za-z0-9._:/-]{1,200}$")
MAX_MESSAGE_CHARS = 200_000
DPAPI_DESCRIPTION = "ComfyUI Styler Pipeline ChatGPT plan"


class ChatGPTPlanError(Exception):
    def __init__(self, message, status=500, retry_after=None):
        super().__init__(message)
        self.status = int(status)
        self.retry_after = retry_after


def _base64url_encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _base64url_decode(value):
    raw = str(value or "").encode("ascii")
    return base64.urlsafe_b64decode(raw + b"=" * (-len(raw) % 4))


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", ctypes.c_ulong),
        ("pbData", ctypes.POINTER(ctypes.c_byte)),
    ]


def _dpapi_transform(value, protect):
    if os.name != "nt":
        return value
    input_buffer = ctypes.create_string_buffer(value, len(value))
    input_blob = _DataBlob(
        len(value),
        ctypes.cast(input_buffer, ctypes.POINTER(ctypes.c_byte)),
    )
    output_blob = _DataBlob()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    if protect:
        succeeded = crypt32.CryptProtectData(
            ctypes.byref(input_blob),
            DPAPI_DESCRIPTION,
            None,
            None,
            None,
            0,
            ctypes.byref(output_blob),
        )
    else:
        succeeded = crypt32.CryptUnprotectData(
            ctypes.byref(input_blob),
            None,
            None,
            None,
            None,
            0,
            ctypes.byref(output_blob),
        )
    if not succeeded:
        raise OSError(ctypes.get_last_error(), "Windows could not protect ChatGPT plan credentials")
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        kernel32.LocalFree(output_blob.pbData)


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _as_float(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _safe_error_detail(payload, fallback="OpenAI request failed"):
    candidates = []
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            candidates.extend([error.get("message"), error.get("detail")])
        elif isinstance(error, str):
            candidates.append(error)
        candidates.extend([payload.get("message"), payload.get("detail")])
    for candidate in candidates:
        value = " ".join(str(candidate or "").split()).strip()
        if value:
            return value[:500]
    return fallback


def _extract_response_text(payload):
    if not isinstance(payload, dict):
        return ""
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    chunks = []
    for entry in payload.get("output") or []:
        if not isinstance(entry, dict):
            continue
        for part in entry.get("content") or []:
            if not isinstance(part, dict):
                continue
            text = part.get("text") or part.get("output_text")
            if isinstance(text, str) and text:
                chunks.append(text)
    return "".join(chunks).strip()


def _verify_rs256_signature(signing_input, signature, jwk):
    if (
        not isinstance(jwk, dict)
        or jwk.get("kty") != "RSA"
        or jwk.get("alg") not in {None, "RS256"}
        or jwk.get("use") not in {None, "sig"}
    ):
        return False
    try:
        modulus = int.from_bytes(_base64url_decode(jwk["n"]), "big")
        exponent = int.from_bytes(_base64url_decode(jwk["e"]), "big")
        signature_int = int.from_bytes(signature, "big")
        encoded_len = (modulus.bit_length() + 7) // 8
        encoded = pow(signature_int, exponent, modulus).to_bytes(encoded_len, "big")
    except (KeyError, TypeError, ValueError, OverflowError):
        return False

    digest_info_prefix = bytes.fromhex("3031300d060960864801650304020105000420")
    digest = hashlib.sha256(signing_input).digest()
    padding_len = encoded_len - len(digest_info_prefix) - len(digest) - 3
    if padding_len < 8:
        return False
    expected = b"\x00\x01" + (b"\xff" * padding_len) + b"\x00" + digest_info_prefix + digest
    return hmac.compare_digest(encoded, expected)


class ChatGPTPlanService:
    def __init__(self):
        self._pending = {}
        self._refresh_lock = asyncio.Lock()
        self._openid_cache = None
        self._jwks_cache = None
        self._callback_runner = None
        self._callback_cleanup_task = None

    def _config_dir(self):
        try:
            import folder_paths

            root = Path(folder_paths.get_user_directory())
        except Exception:
            if os.name == "nt" and os.environ.get("APPDATA"):
                root = Path(os.environ["APPDATA"])
            else:
                root = Path.home() / ".config"
        return root / "ComfyUI-Styler-Pipeline"

    def _credentials_path(self):
        return self._config_dir() / "chatgpt_plan.json"

    def _host_path(self):
        return self._config_dir() / "chatgpt_host.json"

    def _read_json_file(self, path):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                value = json.load(handle)
            return value if isinstance(value, dict) else {}
        except (OSError, ValueError, TypeError):
            return {}

    def _write_json_file(self, path, payload):
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent)
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            try:
                os.chmod(temporary_name, 0o600)
            except OSError:
                pass
            os.replace(temporary_name, path)
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass
        finally:
            try:
                if os.path.exists(temporary_name):
                    os.unlink(temporary_name)
            except OSError:
                pass

    def _load_credentials(self):
        record = self._read_json_file(self._credentials_path())
        protected_data = str(record.get("protected_data") or "").strip()
        if os.name != "nt" or not protected_data:
            return record
        try:
            encrypted = base64.b64decode(protected_data, validate=True)
            decrypted = _dpapi_transform(encrypted, protect=False)
            credentials = json.loads(decrypted.decode("utf-8"))
            return credentials if isinstance(credentials, dict) else {}
        except (OSError, ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
            return {}

    def _save_credentials(self, credentials):
        payload = credentials
        if os.name == "nt":
            serialized = json.dumps(credentials, ensure_ascii=False).encode("utf-8")
            encrypted = _dpapi_transform(serialized, protect=True)
            payload = {
                "protected_data": base64.b64encode(encrypted).decode("ascii"),
                "protection": "windows-dpapi-current-user",
            }
        self._write_json_file(self._credentials_path(), payload)

    def _get_host_id(self):
        host_record = self._read_json_file(self._host_path())
        host_id = str(host_record.get("ext_agent_host_id") or "").strip()
        if host_id.startswith("urn:uuid:"):
            return host_id
        host_id = f"urn:uuid:{uuid.uuid4()}"
        self._write_json_file(self._host_path(), {"ext_agent_host_id": host_id})
        return host_id

    @staticmethod
    def _token_expiry(credentials):
        saved_at = _as_float(credentials.get("saved_at_epoch"))
        expires_in = _as_float(credentials.get("expires_in"))
        return saved_at + expires_in if saved_at and expires_in else 0

    def status(self):
        credentials = self._load_credentials()
        scopes = credentials.get("scopes") or []
        if isinstance(scopes, str):
            scopes = scopes.split()
        connected = bool(
            credentials.get("client_id")
            and credentials.get("refresh_token")
            and REQUIRED_SCOPE in scopes
        )
        return {
            "connected": connected,
            "email": str(credentials.get("email") or ""),
            "expires_at": self._token_expiry(credentials) or None,
            "plan_usage_enabled": REQUIRED_SCOPE in scopes,
        }

    async def _expire_callback_listener(self, runner, delay):
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return
        if self._callback_runner is runner:
            self._callback_runner = None
        if self._callback_cleanup_task is asyncio.current_task():
            self._callback_cleanup_task = None
        await runner.cleanup()

    async def _stop_callback_listener(self):
        cleanup_task = self._callback_cleanup_task
        self._callback_cleanup_task = None
        if cleanup_task and cleanup_task is not asyncio.current_task():
            cleanup_task.cancel()
            await asyncio.gather(cleanup_task, return_exceptions=True)
        runner = self._callback_runner
        self._callback_runner = None
        if runner:
            await runner.cleanup()

    def _schedule_callback_listener_cleanup(self, delay):
        cleanup_task = self._callback_cleanup_task
        if cleanup_task and cleanup_task is not asyncio.current_task():
            cleanup_task.cancel()
        runner = self._callback_runner
        if runner:
            self._callback_cleanup_task = asyncio.create_task(
                self._expire_callback_listener(runner, delay)
            )

    async def _standalone_callback(self, request):
        return await self.callback_response(request.query)

    async def _start_callback_listener(self):
        await self._stop_callback_listener()
        app = web.Application()
        app.router.add_get(CALLBACK_PATH, self._standalone_callback)
        runner = web.AppRunner(app, access_log=None)
        await runner.setup()
        try:
            site = web.TCPSite(runner, "127.0.0.1", 0)
            await site.start()
            sockets = list(site._server.sockets or [])
            if not sockets:
                raise ChatGPTPlanError("Could not start the local ChatGPT callback listener.", 500)
            port = int(sockets[0].getsockname()[1])
        except Exception:
            await runner.cleanup()
            raise
        self._callback_runner = runner
        self._callback_cleanup_task = asyncio.create_task(
            self._expire_callback_listener(runner, 600)
        )
        return port

    async def start_login(self):
        port = await self._start_callback_listener()
        self._pending.clear()
        existing = self._load_credentials()
        issued_client_id = str(existing.get("client_id") or "").strip()
        client_id = issued_client_id or "dynamic_agent_client"
        host_id = self._get_host_id()
        state = _base64url_encode(secrets.token_bytes(32))
        nonce = _base64url_encode(secrets.token_bytes(32))
        verifier = _base64url_encode(secrets.token_bytes(64))
        challenge = _base64url_encode(hashlib.sha256(verifier.encode("ascii")).digest())
        redirect_uri = f"http://127.0.0.1:{port}{CALLBACK_PATH}"

        pending = {
            "created_at": time.time(),
            "state": state,
            "nonce": nonce,
            "code_verifier": verifier,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "existing_client_id": issued_client_id,
            "ext_agent_host_id": host_id,
            "existing_subject": str(existing.get("subject") or ""),
        }
        self._pending[state] = pending

        query = {
            "client_id": client_id,
            "ext_agent_host_id": host_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "scope": REQUESTED_SCOPES,
            "resource": OPENAI_RESOURCE,
            "state": state,
            "nonce": nonce,
            "code_challenge_method": "S256",
            "code_challenge": challenge,
        }
        if issued_client_id:
            id_token_hint = str(existing.get("id_token") or "").strip()
            login_hint = str(existing.get("email") or "").strip()
            if id_token_hint:
                query["id_token_hint"] = id_token_hint
            if login_hint:
                query["login_hint"] = login_hint
        else:
            query["agent_name_hint"] = AGENT_NAME

        return {"authorization_url": f"{AUTHORIZATION_ENDPOINT}?{urlencode(query)}"}

    def _cleanup_pending(self):
        cutoff = time.time() - 600
        stale = [key for key, value in self._pending.items() if value.get("created_at", 0) < cutoff]
        for key in stale:
            self._pending.pop(key, None)

    async def _get_openid_configuration(self, force=False):
        if self._openid_cache is not None and not force:
            return self._openid_cache
        timeout = ClientTimeout(total=15)
        async with ClientSession(timeout=timeout) as session:
            async with session.get(OPENID_CONFIGURATION_URL) as response:
                payload = await response.json(content_type=None)
                if response.status != 200 or not isinstance(payload, dict):
                    raise ChatGPTPlanError("Could not load OpenAI authentication metadata.", 502)
        self._openid_cache = payload
        return payload

    async def _get_jwks(self, force=False):
        if self._jwks_cache is not None and not force:
            return self._jwks_cache
        configuration = await self._get_openid_configuration(force=force)
        jwks_uri = str(configuration.get("jwks_uri") or "").strip()
        if not jwks_uri.startswith("https://auth.openai.com/"):
            raise ChatGPTPlanError("OpenAI authentication metadata returned an invalid JWKS URL.", 502)
        timeout = ClientTimeout(total=15)
        async with ClientSession(timeout=timeout) as session:
            async with session.get(jwks_uri) as response:
                payload = await response.json(content_type=None)
                if response.status != 200 or not isinstance(payload, dict):
                    raise ChatGPTPlanError("Could not load OpenAI signing keys.", 502)
        self._jwks_cache = payload
        return payload

    async def _validate_id_token(self, token, client_id, nonce):
        parts = str(token or "").split(".")
        if len(parts) != 3:
            raise ChatGPTPlanError("OpenAI returned an invalid identity token.", 502)
        try:
            header = json.loads(_base64url_decode(parts[0]).decode("utf-8"))
            claims = json.loads(_base64url_decode(parts[1]).decode("utf-8"))
            signature = _base64url_decode(parts[2])
        except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
            raise ChatGPTPlanError("OpenAI returned an invalid identity token.", 502)

        if header.get("alg") != "RS256" or not header.get("kid"):
            raise ChatGPTPlanError("OpenAI returned an unsupported identity-token signature.", 502)
        signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
        matching_key = None
        for force in (False, True):
            jwks = await self._get_jwks(force=force)
            matching_key = next(
                (key for key in jwks.get("keys") or [] if key.get("kid") == header.get("kid")),
                None,
            )
            if matching_key:
                break
        if not matching_key or not _verify_rs256_signature(signing_input, signature, matching_key):
            raise ChatGPTPlanError("OpenAI identity-token signature validation failed.", 502)

        now = time.time()
        if claims.get("iss") != "https://auth.openai.com":
            raise ChatGPTPlanError("OpenAI identity-token issuer validation failed.", 502)
        audience = claims.get("aud")
        audiences = audience if isinstance(audience, list) else [audience]
        if client_id not in audiences:
            raise ChatGPTPlanError("OpenAI identity-token audience validation failed.", 502)
        if len(audiences) > 1 and claims.get("azp") != client_id:
            raise ChatGPTPlanError("OpenAI identity-token authorized-party validation failed.", 502)
        if _as_float(claims.get("exp")) <= now - 30:
            raise ChatGPTPlanError("OpenAI identity token has expired.", 502)
        if _as_float(claims.get("nbf")) > now + 30:
            raise ChatGPTPlanError("OpenAI identity token is not active yet.", 502)
        if not hmac.compare_digest(str(claims.get("nonce") or ""), str(nonce or "")):
            raise ChatGPTPlanError("OpenAI identity-token nonce validation failed.", 502)
        if not str(claims.get("sub") or "").strip():
            raise ChatGPTPlanError("OpenAI identity token is missing its subject.", 502)
        return claims

    async def handle_callback(self, params):
        state = str(params.get("state") or "")
        pending = self._pending.pop(state, None)
        if not pending or not hmac.compare_digest(state, str(pending.get("state") or "")):
            raise ChatGPTPlanError("This sign-in attempt is invalid or expired.", 400)
        if params.get("error"):
            detail = str(params.get("error_description") or params.get("error") or "Authorization denied")
            raise ChatGPTPlanError(" ".join(detail.split())[:500], 400)

        code = str(params.get("code") or "").strip()
        if not code:
            raise ChatGPTPlanError("OpenAI did not return an authorization code.", 400)
        callback_client_id = str(params.get("client_id") or "").strip()
        existing_client_id = str(pending.get("existing_client_id") or "").strip()
        if existing_client_id:
            if callback_client_id and callback_client_id != existing_client_id:
                raise ChatGPTPlanError("OpenAI returned a different client registration.", 400)
            issued_client_id = existing_client_id
        else:
            issued_client_id = callback_client_id
            if not issued_client_id or issued_client_id == "dynamic_agent_client":
                raise ChatGPTPlanError("OpenAI did not complete the client registration.", 400)

        form = {
            "grant_type": "authorization_code",
            "client_id": issued_client_id,
            "code": code,
            "code_verifier": pending["code_verifier"],
            "redirect_uri": pending["redirect_uri"],
            "resource": OPENAI_RESOURCE,
        }
        timeout = ClientTimeout(total=30)
        async with ClientSession(timeout=timeout) as session:
            async with session.post(TOKEN_ENDPOINT, data=form) as response:
                payload = await response.json(content_type=None)
                if response.status != 200 or not isinstance(payload, dict):
                    raise ChatGPTPlanError(
                        _safe_error_detail(payload, "OpenAI rejected the authorization code."),
                        400 if response.status < 500 else 502,
                    )

        id_token = str(payload.get("id_token") or "").strip()
        claims = await self._validate_id_token(id_token, issued_client_id, pending["nonce"])
        existing_subject = str(pending.get("existing_subject") or "").strip()
        if existing_client_id and existing_subject and claims.get("sub") != existing_subject:
            raise ChatGPTPlanError("The selected ChatGPT account does not match this registration.", 400)

        scopes = str(payload.get("scope") or "").split()
        if REQUIRED_SCOPE not in scopes:
            raise ChatGPTPlanError("ChatGPT plan usage was not authorized for Styler Pipeline.", 403)
        if not payload.get("access_token") or not payload.get("refresh_token"):
            raise ChatGPTPlanError("OpenAI did not return renewable plan credentials.", 502)

        saved_at_epoch = time.time()
        credentials = {
            "email": str(claims.get("email") or ""),
            "name": str(claims.get("name") or ""),
            "issuer": str(claims.get("iss") or ""),
            "subject": str(claims.get("sub") or ""),
            "client_id": issued_client_id,
            "ext_agent_host_id": pending["ext_agent_host_id"],
            "id_token": id_token,
            "access_token": str(payload["access_token"]),
            "refresh_token": str(payload["refresh_token"]),
            "token_type": str(payload.get("token_type") or "Bearer"),
            "expires_in": int(payload.get("expires_in") or 3600),
            "earliest_refresh_at": payload.get("earliest_refresh_at"),
            "scopes": scopes,
            "saved_at": _utc_now_iso(),
            "saved_at_epoch": saved_at_epoch,
        }
        self._save_credentials(credentials)
        return {"connected": True, "email": credentials["email"]}

    async def callback_response(self, params):
        state = str(params.get("state") or "")
        matched_attempt = state in self._pending
        succeeded = False
        try:
            result = await self.handle_callback(params)
            email = str(result.get("email") or "").strip()
            message = "ChatGPT plan connected successfully."
            if email:
                message = f"ChatGPT plan connected as {email}."
            succeeded = True
        except ChatGPTPlanError as error:
            message = str(error)
        except Exception:
            message = "ChatGPT plan sign-in failed. Return to ComfyUI and try again."

        if matched_attempt:
            self._schedule_callback_listener_cleanup(2)
        title = "Connected" if succeeded else "Sign-in failed"
        color = "#4caf50" if succeeded else "#f44336"
        safe_title = html.escape(title)
        safe_message = html.escape(message)
        close_script = "setTimeout(() => window.close(), 1200);" if succeeded else ""
        return web.Response(
            text=f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{safe_title} - Styler Pipeline</title>
</head>
<body style="margin:0;background:#171717;color:#f5f5f5;font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh">
  <main style="max-width:560px;padding:28px;border:1px solid #444;border-radius:12px;background:#242424;text-align:center">
    <h1 style="margin:0 0 12px;color:{color};font-size:24px">{safe_title}</h1>
    <p style="margin:0;line-height:1.5">{safe_message}</p>
    <p style="margin:18px 0 0;color:#aaa;font-size:13px">You can close this window and return to ComfyUI.</p>
  </main>
  <script>{close_script}</script>
</body>
</html>""",
            content_type="text/html",
            charset="utf-8",
        )

    async def _ensure_access_token(self):
        async with self._refresh_lock:
            credentials = self._load_credentials()
            scopes = credentials.get("scopes") or []
            if isinstance(scopes, str):
                scopes = scopes.split()
            if REQUIRED_SCOPE not in scopes or not credentials.get("refresh_token"):
                raise ChatGPTPlanError("Connect your ChatGPT plan first.", 401)

            now = time.time()
            expires_at = self._token_expiry(credentials)
            earliest_refresh_at = _as_float(credentials.get("earliest_refresh_at"))
            refresh_at = max(expires_at - 60, earliest_refresh_at)
            if credentials.get("access_token") and expires_at and now < refresh_at:
                return str(credentials["access_token"])

            form = {
                "grant_type": "refresh_token",
                "client_id": str(credentials.get("client_id") or ""),
                "refresh_token": str(credentials.get("refresh_token") or ""),
                "resource": OPENAI_RESOURCE,
            }
            timeout = ClientTimeout(total=30)
            async with ClientSession(timeout=timeout) as session:
                async with session.post(TOKEN_ENDPOINT, data=form) as response:
                    payload = await response.json(content_type=None)
                    if response.status != 200 or not isinstance(payload, dict):
                        raise ChatGPTPlanError(
                            _safe_error_detail(payload, "ChatGPT plan authorization expired. Sign in again."),
                            401 if response.status < 500 else 502,
                        )
            if not payload.get("access_token") or not payload.get("refresh_token"):
                raise ChatGPTPlanError("OpenAI returned an incomplete token refresh.", 502)

            saved_at_epoch = time.time()
            credentials.update(
                {
                    "access_token": str(payload["access_token"]),
                    "refresh_token": str(payload["refresh_token"]),
                    "token_type": str(payload.get("token_type") or credentials.get("token_type") or "Bearer"),
                    "expires_in": int(payload.get("expires_in") or 3600),
                    "earliest_refresh_at": payload.get("earliest_refresh_at"),
                    "saved_at": _utc_now_iso(),
                    "saved_at_epoch": saved_at_epoch,
                }
            )
            if payload.get("scope"):
                credentials["scopes"] = str(payload["scope"]).split()
            self._save_credentials(credentials)
            return str(credentials["access_token"])

    async def list_models(self):
        access_token = await self._ensure_access_token()
        timeout = ClientTimeout(total=30)
        headers = {"Authorization": f"Bearer {access_token}"}
        async with ClientSession(timeout=timeout) as session:
            async with session.get(OPENAI_MODELS_URL, headers=headers) as response:
                payload = await response.json(content_type=None)
                if response.status != 200 or not isinstance(payload, dict):
                    raise ChatGPTPlanError(
                        _safe_error_detail(payload, "Could not load ChatGPT plan models."),
                        response.status,
                        response.headers.get("Retry-After"),
                    )
        models = []
        seen = set()
        for entry in payload.get("models") or []:
            if not isinstance(entry, dict) or entry.get("visibility") != "list":
                continue
            model_id = str(entry.get("slug") or "").strip()
            if not model_id or model_id in seen:
                continue
            seen.add(model_id)
            models.append(
                {
                    "id": model_id,
                    "label": str(entry.get("display_name") or model_id).strip(),
                }
            )
        return {"models": models}

    @staticmethod
    def _normalize_messages(messages):
        if not isinstance(messages, list) or not messages:
            raise ChatGPTPlanError("At least one prompt message is required.", 400)
        instructions = []
        input_messages = []
        total_chars = 0
        for message in messages:
            if not isinstance(message, dict):
                raise ChatGPTPlanError("Prompt messages must be objects.", 400)
            role = str(message.get("role") or "user").strip().lower()
            content = str(message.get("content") or "").strip()
            if role not in {"system", "developer", "user", "assistant"} or not content:
                raise ChatGPTPlanError("Prompt messages contain an invalid role or empty content.", 400)
            total_chars += len(content)
            if total_chars > MAX_MESSAGE_CHARS:
                raise ChatGPTPlanError("Prompt is too large.", 413)
            if role == "system":
                instructions.append(content)
            else:
                input_messages.append({"role": role, "content": content})
        if not input_messages:
            raise ChatGPTPlanError("At least one non-system prompt message is required.", 400)
        return "\n\n".join(instructions), input_messages

    async def create_response(self, request_payload):
        model = str(request_payload.get("model") or "").strip()
        if not MODEL_ID_RE.fullmatch(model):
            raise ChatGPTPlanError("Select a valid ChatGPT plan model.", 400)
        instructions, input_messages = self._normalize_messages(request_payload.get("messages"))
        try:
            timeout_ms = int(request_payload.get("timeout_ms") or 30_000)
        except (TypeError, ValueError):
            timeout_ms = 30_000
        timeout_seconds = max(1, min(300, timeout_ms / 1000))
        access_token = await self._ensure_access_token()
        body = {
            "model": model,
            "input": input_messages,
            "store": False,
            "stream": True,
        }
        if instructions:
            body["instructions"] = instructions

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        timeout = ClientTimeout(total=timeout_seconds)
        chunks = []
        completed_payload = None
        async with ClientSession(timeout=timeout) as session:
            async with session.post(OPENAI_RESPONSES_URL, headers=headers, json=body) as response:
                if response.status != 200:
                    payload = await response.json(content_type=None)
                    raise ChatGPTPlanError(
                        _safe_error_detail(payload),
                        response.status,
                        response.headers.get("Retry-After"),
                    )
                buffer = ""
                async for raw_chunk in response.content.iter_any():
                    buffer += raw_chunk.decode("utf-8", errors="replace").replace("\r\n", "\n")
                    while "\n\n" in buffer:
                        event_block, buffer = buffer.split("\n\n", 1)
                        data_lines = [
                            line[5:].lstrip()
                            for line in event_block.split("\n")
                            if line.startswith("data:")
                        ]
                        if not data_lines:
                            continue
                        data_text = "\n".join(data_lines)
                        if data_text == "[DONE]":
                            continue
                        try:
                            event = json.loads(data_text)
                        except json.JSONDecodeError:
                            continue
                        event_type = str(event.get("type") or "")
                        if event_type == "response.output_text.delta":
                            delta = event.get("delta")
                            if isinstance(delta, str):
                                chunks.append(delta)
                        elif event_type == "response.completed":
                            completed_payload = event.get("response")
                        elif event_type in {"response.failed", "error"}:
                            failure = event.get("response") or event
                            raise ChatGPTPlanError(_safe_error_detail(failure), 502)

        reply_text = "".join(chunks).strip()
        if not reply_text:
            reply_text = _extract_response_text(completed_payload)
        if not reply_text:
            raise ChatGPTPlanError("No reply content received from ChatGPT plan.", 502)
        return {"reply_text": reply_text}

    async def logout(self):
        await self._stop_callback_listener()
        self._pending.clear()
        credentials = self._load_credentials()
        refresh_token = str(credentials.get("refresh_token") or "").strip()
        client_id = str(credentials.get("client_id") or "").strip()
        revoked = False
        if refresh_token and client_id:
            try:
                configuration = await self._get_openid_configuration()
                endpoint = str(configuration.get("revocation_endpoint") or "").strip()
                if endpoint.startswith("https://auth.openai.com/"):
                    form = {
                        "token": refresh_token,
                        "token_type_hint": "refresh_token",
                        "client_id": client_id,
                    }
                    timeout = ClientTimeout(total=20)
                    async with ClientSession(timeout=timeout) as session:
                        async with session.post(endpoint, data=form) as response:
                            revoked = response.status == 200
            except Exception:
                revoked = False

        for key in (
            "access_token",
            "refresh_token",
            "id_token",
            "token_type",
            "expires_in",
            "earliest_refresh_at",
            "scopes",
            "saved_at",
            "saved_at_epoch",
        ):
            credentials.pop(key, None)
        if credentials:
            self._save_credentials(credentials)
        return {"connected": False, "remote_revocation_confirmed": revoked}
