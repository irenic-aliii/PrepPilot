from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models import StudyPlanRequest, QuizRequest
from ai_client import client, MODEL_NAME
from prompts import STUDY_PLAN_PROMPT, QUIZ_PROMPT
import json

# Load API key from .env

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # We'll restrict this later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
def home():
    return {
        "message": "PrepPilot Backend is Running!"
    }

@app.post("/generate-plan")
def generate_plan(request: StudyPlanRequest):

    prompt = f"""
{STUDY_PLAN_PROMPT}

Student Name:
{request.name}

Subjects:
{request.subjects}

Weak Subjects:
{request.weak_subjects}

Hours Per Day:
{request.hours_per_day}

Exam Date:
{request.exam_date}
"""

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": "You are an expert study planner."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.5
    )

    plan = json.loads(response.choices[0].message.content)
    return plan

@app.post("/generate-quiz")
def generate_quiz(request: QuizRequest):

    prompt = f"""
{QUIZ_PROMPT}

Topic:
{request.topic}
"""

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": "You are an expert teacher."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.5
    )

    quiz = json.loads(response.choices[0].message.content)
    return quiz