# Worker Boundary

This directory marks the future job-runner layer for the web app.

Expected responsibilities:
- pull queued jobs from the database
- invoke the existing article-to-EPUB pipeline
- record success/failure status
- persist output file location
- trigger email delivery

The web UI should create jobs. The worker should execute them.
