# PSAUX Verify API

One backend the mobile app posts images to. It decodes the QR **on the server**,
analyses it per site, stores the submission, and returns the verdict. The review
consoles read the queue from the same API.

## Run it

```bash
cd /Users/ell/psaux-api
npm install      # first time only
npm start        # http://localhost:4000
```

Deploy it anywhere Node runs (Render, Railway, a VPS, Cloud Run). Set `PORT` via env.

## Sites

`psaux` = TASK barcode validator · `tatawwu` = volunteering certificate · `gym` = gym check-in

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/:site/ingest` | the app uploads an image → returns the verdict |
| GET  | `/api/:site/submissions` | the review console reads the queue (`?status=approved|rejected`) |
| POST | `/api/:site/review/:id` | manual override `{ "status": "approved" | "rejected" }` |
| GET  | `/images/:file` | the stored image |

### Uploading an image (two ways)

**Multipart file** (recommended for a mobile app):
```bash
curl -X POST http://localhost:4000/api/gym/ingest \
  -F "image=@checkin.png" \
  -F "member=Bandar Al-Malki"
```

**JSON base64**:
```bash
curl -X POST http://localhost:4000/api/tatawwu/ingest \
  -H "Content-Type: application/json" \
  -d '{ "image": "<base64 or data URL>", "from": "Faisal" }'
```

### Response

```json
{
  "id": "rcv_5c2e07145648",
  "site": "gym",
  "status": "approved",
  "qrText": "https://psaux.app/checkin?g=GYM-RYD-001&t=PSX-7K2Q-9M4X",
  "qrHost": "psaux.app",
  "gym": "GYM-RYD-001",
  "token": "PSX-7K2Q-9M4X",
  "imageUrl": "/images/gym_rcv_5c2e07145648.png",
  "receivedAt": 1784113721830
}
```
`status` is always `"approved"` or `"rejected"` (with a `reason`).

## From a Flutter app (Dart)

```dart
import 'package:http/http.dart' as http;

Future<Map<String, dynamic>> sendImage(String site, File image, String from) async {
  final req = http.MultipartRequest(
    'POST', Uri.parse('https://YOUR_API_HOST/api/$site/ingest'),
  );
  req.fields['from'] = from;
  req.files.add(await http.MultipartFile.fromPath('image', image.path));
  final res = await http.Response.fromStream(await req.send());
  return jsonDecode(res.body); // { status: approved|rejected, ... }
}
```

## Verification rules

- **psaux** — approves if the QR links to `sulitest.org` (or a subdomain).
- **tatawwu** — reads the certificate code from the QR and matches the register.
- **gym** — approves a `psaux.app/checkin?g=…&t=…` link.

Data is stored under `data/` (JSON per site + images). Replace with a database for production.
