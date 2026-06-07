# AI Assistant Operational Rules

## Database & Backend Changes Protocol
Before making any changes that will affect the database or backend in a significant way:
1. **Pause and Evaluate**: Analyze what will be touched and what it might potentially break.
2. **Impact Assessment**: Determine if these changes are purely additions that do not affect existing functionality or if they modify integral systems.
3. **Explicit Consent Required**: You must obtain explicit consent from the user before wiping anything in the database or changing anything integral.
4. **Investigation Report**: Present an investigation of what the changes might potentially do, along with a confidence rating (e.g., High, Medium, Low) of the expected impact.
5. **Execution**: Only proceed with making the code changes after the user has explicitly stated "yes" and allowed you to continue based on the confidence rating.

## Documentation & External Knowledge
When external help or library documentation is needed:
- **`context7` (MCP)**: Use this first to pull official, up-to-date documentation.
- **`ref` (MCP)**: Use this as the secondary source if `context7` fails.
