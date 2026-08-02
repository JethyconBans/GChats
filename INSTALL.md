# Backend patch installation

Copy `app.py`, `requirements.txt`, `render.yaml`, the two templates, and `mobile_api_smoke_test.py` into your existing Flask project.

The patch adds:

- Permanent hashed mobile API tokens
- JSON mobile registration/login/bootstrap endpoints
- Local-first message synchronization endpoints
- Media upload endpoints
- Profile and group management endpoints
- Account deletion endpoint
- Socket.IO authentication using the mobile token
- Privacy policy and external deletion pages

Run:

```powershell
python -m pip install -r requirements.txt
python mobile_api_smoke_test.py
```

Then commit and push to GitHub. Render will redeploy automatically.
