STUDY_PLAN_PROMPT = """
You are an expert study planner.

Create a personalized 7-day study timetable.

Student Name: {name}
Subjects: {subjects}
Weak Subjects: {weak_subjects}
Study Hours Per Day: {hours_per_day}
Exam Date: {exam_date}

VERY IMPORTANT:

Return ONLY valid JSON.

Do not write markdown.
Do not use ```json.
Do not add explanations.

Return exactly in this format:

{{
  "days": [
    {{
      "day": "Monday",
      "focus": "Maths",
      "sessions": [
        {{
          "subject": "Maths",
          "activity": "...",
          "duration": "90 min"
        }}
      ]
    }}
  ]
}}

Create all 7 days.
Make the timetable realistic.
Give more time to weak subjects.
"""

QUIZ_PROMPT = """
You are an expert teacher.

Generate a quiz based ONLY on the topic provided.

Return ONLY valid JSON.

The response must follow this exact structure:

{
  "questions": [
    {
      "question": "string",
      "options": [
        "string",
        "string",
        "string",
        "string"
      ],
      "answer": "string",
      "explanation": "string"
    }
  ]
}

Rules:

- Generate exactly 10 questions.
- Every question must have exactly 4 options.
- "answer" must exactly match one of the options.
- Explanation should be 1-2 short sentences.
- Do not include markdown.
- Do not wrap the JSON inside ``` blocks.
- Return JSON only.
"""