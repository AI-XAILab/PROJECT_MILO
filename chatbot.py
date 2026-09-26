"""PROJECT_MILO Version 1: a simple terminal chatbot."""

import os
from pathlib import Path

from dotenv import load_dotenv
from openai import APIError, OpenAI


def main():
    # Load local settings without replacing existing environment variables.
    load_dotenv(Path(__file__).with_name(".env"))
    if not os.getenv("OPENAI_API_KEY", "").strip():
        print("Set OPENAI_API_KEY in your environment or .env file first.")
        return

    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    history = []

    # The official client reads OPENAI_API_KEY from the environment.
    with OpenAI(timeout=30.0, max_retries=0) as client:
        print("PROJECT_MILO - Type 'exit' to quit.")
        while True:
            message = input("You: ").strip()
            if message.lower() == "exit":
                break
            if not message:
                continue

            user_message = {"role": "user", "content": message}
            try:
                response = client.responses.create(
                    model=model,
                    input=history + [user_message],
                    store=False,
                )
            except APIError:
                # Raw errors can contain sensitive information; do not print them.
                print("Request failed. Check your connection, API key, model, and API quota, then try again.")
                continue

            reply = response.output_text
            if not reply:
                print("No text response received. Please try again.")
                continue

            # Remember successful turns for the next message in this session.
            history.append(user_message)
            history.extend(response.output)
            print(f"MILO: {reply}\n")

    print("Goodbye!")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nGoodbye!")
