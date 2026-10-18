"""School payment request demo API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api import router

app = FastAPI(title="School Payment Request Demo", version="0.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Demo-User-Id"],
)


@app.exception_handler(SQLAlchemyError)
async def handle_database_error(_request, _exc: SQLAlchemyError) -> JSONResponse:
    """Keep unexpected database failures in the API's stable error shape."""
    return JSONResponse(
        status_code=500,
        content={"detail": {"code": "internal_error", "message": "A database error occurred"}},
    )


app.include_router(router)
