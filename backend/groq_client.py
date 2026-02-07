"""Groq LLM client wrapper using langchain-groq."""

import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_groq import ChatGroq

# Explicitly load .env from the backend directory
load_dotenv(Path(__file__).resolve().parent / ".env")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def get_chat_groq(temperature: float = 0.7) -> ChatGroq:
    """Return a configured ChatGroq instance."""
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set in environment")
    return ChatGroq(
        api_key=GROQ_API_KEY,
        model=GROQ_MODEL,
        temperature=temperature,
    )
