const DESTINATION = "info@spearsltd.co.uk";
const FROM = "website@londondronesurveys.co.uk";
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value, 4000)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/request-survey") {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "POST") {
      return json({ ok: false, message: "Method not allowed." }, 405);
    }

    try {
      const form = await request.formData();

      // Honeypot: real visitors never fill this field.
      if (clean(form.get("company_website"), 200)) {
        return json({ ok: true, message: "Thank you. Your enquiry has been received." });
      }

      const name = clean(form.get("name"), 120);
      const phone = clean(form.get("phone"), 80);
      const email = clean(form.get("email"), 160);
      const location = clean(form.get("location"), 200);
      const surveyType = clean(form.get("survey_type"), 160);
      const message = clean(form.get("message"), 1500);

      if (!name || !phone || !email || !location || !surveyType || !message) {
        return json({ ok: false, message: "Please complete all required fields." }, 400);
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ ok: false, message: "Please enter a valid email address." }, 400);
      }

      const rawFiles = form.getAll("attachments").filter(
        (item) => item && typeof item === "object" && typeof item.arrayBuffer === "function" && item.size > 0
      );

      if (rawFiles.length > 5) {
        return json({ ok: false, message: "Please attach no more than 5 files." }, 400);
      }

      let totalBytes = 0;
      const attachments = [];

      for (const file of rawFiles) {
        if (!ALLOWED_TYPES.has(file.type)) {
          return json({ ok: false, message: "Attachments must be JPG, PNG or PDF files." }, 400);
        }
        totalBytes += file.size;
        if (totalBytes > MAX_ATTACHMENT_BYTES) {
          return json({ ok: false, message: "Please keep attachments below 3 MB in total." }, 400);
        }
        attachments.push({
          filename: clean(file.name, 140) || "attachment",
          content: await file.arrayBuffer(),
          type: file.type,
          disposition: "attachment"
        });
      }

      const subject = `New drone survey enquiry — ${name}`;
      const text = [
        "New London Drone Surveys website enquiry",
        "",
        `Name: ${name}`,
        `Phone: ${phone}`,
        `Email: ${email}`,
        `Property / location: ${location}`,
        `Survey type: ${surveyType}`,
        "",
        "What they would like inspected:",
        message,
        "",
        `Attachments: ${attachments.length}`
      ].join("\n");

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#10213b;line-height:1.55;max-width:680px">
          <h2 style="color:#071f32">New drone survey enquiry</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:7px 12px 7px 0;font-weight:700">Name</td><td>${escapeHtml(name)}</td></tr>
            <tr><td style="padding:7px 12px 7px 0;font-weight:700">Phone</td><td>${escapeHtml(phone)}</td></tr>
            <tr><td style="padding:7px 12px 7px 0;font-weight:700">Email</td><td>${escapeHtml(email)}</td></tr>
            <tr><td style="padding:7px 12px 7px 0;font-weight:700">Property / location</td><td>${escapeHtml(location)}</td></tr>
            <tr><td style="padding:7px 12px 7px 0;font-weight:700">Survey type</td><td>${escapeHtml(surveyType)}</td></tr>
          </table>
          <h3 style="margin-top:24px;color:#071f32">What they would like inspected</h3>
          <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
          <p style="margin-top:24px;color:#66748b;font-size:13px">Submitted via londondronesurveys.co.uk</p>
        </div>`;

      await env.EMAIL.send({
        to: DESTINATION,
        from: FROM,
        replyTo: email,
        subject,
        text,
        html,
        ...(attachments.length ? { attachments } : {})
      });

      return json({ ok: true, message: "Thank you. Your survey request has been sent." });
    } catch (error) {
      console.error("Survey form error", error);
      return json({ ok: false, message: "We could not send your enquiry. Please try again shortly." }, 500);
    }
  }
};
