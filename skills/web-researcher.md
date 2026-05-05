# web-researcher

**Trigger:** "Research [any topic]"

**Action:**
1. Search DuckDuckGo Lite for the topic
2. Extract relevant facts and data from results
3. Synthesize a structured report with:
   - Summary
   - Key findings
   - Links to sources
4. Deliver the report inline or as a shared document

**Security:** All web requests use a direct HTTPS connection.
Results are sanitized before being passed to the LLM.