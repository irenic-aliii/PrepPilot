from groq import Groq
from dotenv import load_dotenv
import os

load_dotenv()

MODEL_NAME = "openai/gpt-oss-120b"

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)