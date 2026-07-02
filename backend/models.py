from pydantic import BaseModel

class StudyPlanRequest(BaseModel):
    name: str
    subjects: str
    weak_subjects: str
    hours_per_day: int
    exam_date: str

class QuizRequest(BaseModel):
    topic: str


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    answer: str
    explanation: str


class QuizResponse(BaseModel):
    questions: list[QuizQuestion]