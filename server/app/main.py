import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config
from .db import ensure_indexes
from .routes import auth, content, insights, rooms, sessions, users
from .validation_messages import validation_detail

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("bloom")


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await ensure_indexes()
    except Exception:  # DB may still be starting; indexes are retried on next start
        log.exception("could not create indexes")
    yield


app = FastAPI(title="Bloom API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["Authorization", "Content-Type"],
                   expose_headers=["X-Error-Code"])


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": validation_detail(exc.errors())})


@app.exception_handler(StarletteHTTPException)
async def http_handler(_: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else "שגיאה"
    if exc.status_code == 404 and detail == "Not Found":
        detail = "לא נמצא"
    return JSONResponse(status_code=exc.status_code, content={"detail": detail}, headers=getattr(exc, "headers", None))


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("unhandled error")
    return JSONResponse(status_code=500, content={"detail": "שגיאת שרת, נסו שוב"})


@app.get("/health")
async def health():
    return {"status": "ok"}


for r in (auth.router, users.router, content.router, sessions.router, insights.router, rooms.router):
    app.include_router(r, prefix="/api")
