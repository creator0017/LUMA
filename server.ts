import express from "express";
import path from "path";
import cors from "cors";
import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = process.env.NODE_ENV === "production" && process.env.PORT 
  ? parseInt(process.env.PORT, 10) 
  : 3000;

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(cors());

// --- Mongoose Models & Database Connection Setup ---
mongoose.set('bufferCommands', false);
let isMongoConnected = false;

// In-memory fallback stores if MongoDB is not connected yet - pure real-time data storage
const memoryStore = {
  projects: [] as any[],
  tasks: [] as any[],
  feedbacks: [] as any[],
  users: [] as any[],
  journals: [] as any[]
};

// Memory active OTP store with attempt limits and expiry
const activeOtps = new Map<string, { code: string; expiresAt: number; attempts: number }>();

// Cached pooled nodemailer transporter
let mailTransporter: any = null;

function getMailTransporter() {
  if (mailTransporter) return mailTransporter;
  const smtpUser = process.env.SMTP_USER || "somshekar0003@gmail.com";
  const rawPass = process.env.SMTP_PASS || "cinr ghpi hega pxme";
  const smtpPass = rawPass.replace(/\s+/g, "");

  if (smtpUser && smtpPass) {
    try {
      import("nodemailer").then((nodemailer) => {
        mailTransporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          pool: true,
          maxConnections: 3,
          auth: { user: smtpUser, pass: smtpPass }
        });
      }).catch((e) => console.warn("Mail transporter load notice:", e));
    } catch (e) {
      console.warn("Mail transporter init notice:", e);
    }
  }
  return mailTransporter;
}

// Mongoose Schemas
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: "" },
  status: { type: String, enum: ['todo', 'in-progress', 'completed'], default: 'todo' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  assignedTo: { type: String, default: 'Unassigned' },
  dueDate: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  codebaseType: { type: String, default: 'Full-Stack MERN' },
  database: { type: String, default: 'MongoDB' },
  backend: { type: String, default: 'Express' },
  frontend: { type: String, default: 'React' },
  auth: { type: String, default: 'Firebase' },
  status: { type: String, enum: ['active', 'archived', 'staging'], default: 'active' },
  updatedAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  password: { type: String, default: '' },
  displayName: { type: String, default: '' },
  authProvider: { type: String, default: 'password' },
  emailVerified: { type: Boolean, default: false },
  photoURL: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const TaskModel = mongoose.models.Task || mongoose.model('Task', taskSchema);
const ProjectModel = mongoose.models.Project || mongoose.model('Project', projectSchema);
const UserModel: any = mongoose.models.User || mongoose.model('User', userSchema);

const journalSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  content: { type: String, default: "" },
  preview: { type: String, default: "" },
  mood: { type: String, default: "Calm" },
  tag: { type: String, default: "Calm" },
  role: { type: String, default: "Developer" },
  formattedDate: { type: String, default: "" },
  aiInsight: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const JournalModel: any = mongoose.models.Journal || mongoose.model('Journal', journalSchema);

// Attempt MongoDB Connection
async function connectMongoDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || mongoUri.includes("username:password")) {
    console.log("ℹ️ MONGODB_URI not configured or using placeholder. Running MERN backend with intelligent in-memory fallback mode.");
    return;
  }
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    isMongoConnected = true;
    console.log("✅ Successfully connected to MongoDB database.");
  } catch (err) {
    console.warn("⚠️ MongoDB connection warning: Using robust in-memory storage fallback.", err);
  }
}

connectMongoDB();

// --- API Routes ---

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: isMongoConnected ? "MongoDB Connected" : "In-Memory Fallback Mode",
    timestamp: new Date().toISOString()
  });
});

// Projects API
app.get("/api/projects", async (req, res) => {
  try {
    if (isMongoConnected) {
      const projects = await ProjectModel.find().sort({ updatedAt: -1 });
      return res.json(projects);
    }
    res.json(memoryStore.projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    const data = req.body || {};
    if (isMongoConnected) {
      const newProj = new ProjectModel(data);
      const saved = await newProj.save();
      return res.json(saved);
    }
    const newProj = { _id: "proj_" + Date.now(), ...data, updatedAt: new Date().toISOString() };
    memoryStore.projects.unshift(newProj);
    res.json(newProj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Tasks API (CRUD)
app.get("/api/tasks", async (req, res) => {
  try {
    if (isMongoConnected) {
      const tasks = await TaskModel.find().sort({ createdAt: -1 });
      return res.json(tasks);
    }
    res.json(memoryStore.tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const data = req.body || {};
    if (!data.title) {
      return res.status(400).json({ error: "Task title is required" });
    }
    if (isMongoConnected) {
      const newTask = new TaskModel(data);
      const saved = await newTask.save();
      return res.json(saved);
    }
    const newTask = { _id: "task_" + Date.now(), ...data, createdAt: new Date().toISOString() };
    memoryStore.tasks.unshift(newTask);
    res.json(newTask);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    if (isMongoConnected) {
      const updated = await TaskModel.findByIdAndUpdate(id as any, updates, { new: true } as any);
      if (!updated) return res.status(404).json({ error: "Task not found" });
      return res.json(updated);
    }
    const index = memoryStore.tasks.findIndex(t => t._id === id);
    if (index === -1) return res.status(404).json({ error: "Task not found" });
    memoryStore.tasks[index] = { ...memoryStore.tasks[index], ...updates };
    res.json(memoryStore.tasks[index]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (isMongoConnected) {
      await (TaskModel as any).findByIdAndDelete(id);
      return res.json({ success: true, id });
    }
    memoryStore.tasks = memoryStore.tasks.filter(t => t._id !== id);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Journals API (Real-Time CRUD with MongoDB + In-Memory Fallback)
app.get("/api/journals", async (req, res) => {
  try {
    const { userId, sort } = req.query as { userId?: string; sort?: string };
    const sortDirection = sort === 'asc' ? 1 : -1;

    if (isMongoConnected) {
      const filter: any = {};
      if (userId) filter.userId = userId;
      const journals = await JournalModel.find(filter).sort({ createdAt: sortDirection }).lean();
      const mapped = journals.map((j: any) => ({
        ...j,
        id: j._id ? j._id.toString() : j.id,
        userId: j.userId
      }));
      return res.json(mapped);
    }

    let list = [...memoryStore.journals];
    if (userId) {
      list = list.filter(j => j.userId === userId);
    }
    list.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime();
      const tB = new Date(b.createdAt || 0).getTime();
      return sortDirection === 1 ? tA - tB : tB - tA;
    });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/journals", async (req, res) => {
  try {
    const data = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!data.userId) {
      return res.status(400).json({ error: "userId is required to persist journal" });
    }

    const contentStr = String(data.content || "").trim();
    const cleanEntry = {
      userId: String(data.userId).trim(),
      title: (String(data.title || "Daily Reflection")).trim(),
      content: contentStr,
      preview: data.preview || (contentStr.length > 80 ? `${contentStr.slice(0, 80)}...` : contentStr),
      mood: String(data.mood || "Calm"),
      tag: String(data.tag || data.mood || "Calm"),
      role: String(data.role || "Developer"),
      formattedDate: data.formattedDate || new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }),
      aiInsight: String(data.aiInsight || ""),
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: new Date()
    };

    if (isMongoConnected) {
      const newDoc = new JournalModel(cleanEntry);
      const saved = await newDoc.save();
      const savedObj = saved.toObject();
      const responsePayload = {
        success: true,
        ...savedObj,
        id: saved._id.toString()
      };
      // Also sync to memoryStore
      memoryStore.journals.unshift(responsePayload);
      return res.json(responsePayload);
    }

    const newId = data.id || "jnl_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const savedEntry = {
      _id: newId,
      id: newId,
      ...cleanEntry,
      success: true
    };
    memoryStore.journals.unshift(savedEntry);
    res.json(savedEntry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/journals/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = (req.body && typeof req.body === 'object') ? req.body : {};
    updates.updatedAt = new Date();

    if (updates.content && !updates.preview) {
      const contentStr = String(updates.content).trim();
      updates.preview = contentStr.length > 80 ? `${contentStr.slice(0, 80)}...` : contentStr;
    }

    if (isMongoConnected) {
      let updated: any = null;
      try {
        updated = await JournalModel.findByIdAndUpdate(id as any, updates, { new: true } as any);
      } catch (_) {}
      if (!updated) {
        updated = await JournalModel.findOneAndUpdate({ id } as any, updates, { new: true } as any);
      }
      if (updated) {
        const obj = updated.toObject();
        return res.json({ success: true, ...obj, id: obj._id ? obj._id.toString() : id });
      }
    }

    const idx = memoryStore.journals.findIndex(j => j._id === id || j.id === id);
    if (idx !== -1) {
      memoryStore.journals[idx] = { ...memoryStore.journals[idx], ...updates };
      return res.json({ success: true, ...memoryStore.journals[idx] });
    }

    res.json({ success: true, id, ...updates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/journals/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (isMongoConnected) {
      try {
        await JournalModel.findByIdAndDelete(id as any);
      } catch (_) {}
      try {
        await JournalModel.findOneAndDelete({ id } as any);
      } catch (_) {}
    }
    memoryStore.journals = memoryStore.journals.filter(j => j._id !== id && j.id !== id);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Gemini Resilient Fallback Ladder as mandated by production specifications
const GEMINI_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.7-flash",
  "gemini-2.5-flash"
];

async function generateContentWithFallback(ai: GoogleGenAI, contents: any) {
  let lastError: any = null;
  for (const modelName of GEMINI_FALLBACK_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
      });
      if (response && response.text) {
        return { text: response.text, modelUsed: modelName };
      }
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code || (err?.error && err.error.code) || 'UNKNOWN';
      console.warn(`[Gemini Fallback Ladder] Model ${modelName} failed (${status}), attempting next model in ladder...`);
    }
  }
  throw lastError || new Error("All Gemini fallback models exhausted.");
}

// Gemini AI Assistant with Resilient Fallback Ladder
app.post("/api/ai/generate", async (req, res) => {
  try {
    const data = (req.body && typeof req.body === 'object') ? req.body : {};
    const { prompt, context } = data;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({
        result: `[AI Sanctuary Offline - GEMINI_API_KEY not configured] Reflection for: "${prompt}". Your thoughts are grounded in calm and clarity. Taking intentional moments each day strengthens mindfulness and personal compounding growth.`,
        modelUsed: "mock"
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const fullPrompt = context 
      ? `Context: ${context}\n\nTask/Question: ${prompt}`
      : prompt;

    try {
      const { text, modelUsed } = await generateContentWithFallback(ai, fullPrompt);
      return res.json({ result: text, modelUsed });
    } catch (modelErr: any) {
      console.warn("All live Gemini models encountered rate-limits/unavailability. Providing graceful sanctuary guidance.", modelErr);
      return res.json({
        result: `Mindful Reflection on "${prompt}":\n\nTake a slow, deep breath. Focus on one intentional task at a time, celebrate your micro-wins today, and trust the process of continuous personal growth.`,
        modelUsed: "sanctuary-resilience-fallback",
        notice: "Gemini free tier quota temporarily busy; resilient offline fallback engaged."
      });
    }
  } catch (err: any) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: err.message || "Failed to generate AI response" });
  }
});

// Chat endpoint for Luma Sanctuary
app.post("/api/ai/chat", async (req, res) => {
  try {
    const data = (req.body && typeof req.body === 'object') ? req.body : {};
    const { prompt } = data;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({
        reply: "Your sanctuary space is grounded in calm and clarity. Taking a moment each day to reflect strengthens emotional resilience.",
        modelUsed: "mock"
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const chatPrompt = `You are Luma AI, a compassionate, mindful wellness companion. Provide a concise, uplifting 2-3 sentence reflection or guidance for: "${prompt}"`;

    try {
      const { text, modelUsed } = await generateContentWithFallback(ai, chatPrompt);
      return res.json({ reply: text, modelUsed });
    } catch (chatErr: any) {
      console.warn("Chat models encountered rate-limits. Returning resilient guidance.", chatErr);
      return res.json({
        reply: "Reflection is the seed of wisdom. Every breath is a fresh opportunity to begin anew and find clarity within.",
        modelUsed: "sanctuary-resilience-fallback"
      });
    }
  } catch (err: any) {
    res.json({ reply: "Luma Sanctuary is here with you. Your thoughts and feelings are valid and supported." });
  }
});

// Audio Speech-to-Text Transcription via Gemini Multimodal with Resilient Fallback Ladder
app.post("/api/ai/transcribe-audio", async (req, res) => {
  try {
    const data = (req.body && typeof req.body === 'object') ? req.body : {};
    const { audioBase64, mimeType } = data;
    if (!audioBase64) {
      return res.status(400).json({ error: "audioBase64 is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "GEMINI_API_KEY not configured on server" });
    }

    const ai = new GoogleGenAI({ apiKey });
    const cleanBase64 = String(audioBase64).replace(/^data:[^;]+;base64,/, '');
    const cleanMime = mimeType || 'audio/webm';

    const contents = [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: cleanBase64
            }
          },
          {
            text: 'Please listen to this audio recording carefully and transcribe everything the speaker is saying verbatim. Return ONLY the transcribed spoken words and nothing else. Do not hallucinate, do not add filler phrases, and do not add quotation marks or intro notes.'
          }
        ]
      }
    ];

    try {
      const { text, modelUsed } = await generateContentWithFallback(ai, contents);
      const cleanTranscript = (text || '').trim();
      return res.json({
        transcript: cleanTranscript,
        modelUsed,
        success: true
      });
    } catch (modelErr: any) {
      console.warn("Gemini audio transcription fallback notice:", modelErr);
      return res.status(500).json({
        error: "Unable to transcribe audio with available models: " + (modelErr?.message || 'Server error'),
        transcript: ""
      });
    }
  } catch (err: any) {
    console.error("Transcribe audio route error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// Feedback endpoint
app.post("/api/feedback", (req, res) => {
  try {
    const data = req.body || {};
    const entry = {
      _id: "fb_" + Date.now(),
      feedback: data.feedback || data.message || data.comment || "General feedback",
      rating: data.rating || 5,
      email: data.email || "anonymous",
      timestamp: new Date().toISOString()
    };
    memoryStore.feedbacks.unshift(entry);
    console.log("📝 Feedback received:", entry);
    res.status(200).json({
      success: true,
      message: "Feedback received successfully. Thank you for your support!",
      entry
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Failed to submit feedback",
      message: err.message
    });
  }
});

app.get("/api/feedback", (req, res) => {
  res.json({ success: true, feedbacks: memoryStore.feedbacks });
});

// Email OTP Dispatcher Endpoint
app.post("/api/auth/send-email-otp", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ success: false, error: "Email and code are required" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.toString().trim();

    // Store in active OTP memory map (valid for 15 minutes, max 5 attempts)
    activeOtps.set(cleanEmail, {
      code: cleanCode,
      expiresAt: Date.now() + 15 * 60 * 1000,
      attempts: 0
    });

    const smtpUser = process.env.SMTP_USER || "somshekar0003@gmail.com";
    const rawPass = process.env.SMTP_PASS || "cinr ghpi hega pxme";
    const smtpPass = rawPass.replace(/\s+/g, "");

    let delivered = false;
    if (smtpUser && smtpPass) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = mailTransporter || nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          pool: true,
          maxConnections: 3,
          auth: { user: smtpUser, pass: smtpPass }
        });
        mailTransporter = transporter;

        await transporter.sendMail({
          from: `"LUMA Security" <${smtpUser}>`,
          replyTo: smtpUser,
          to: cleanEmail,
          subject: `Your LUMA Verification Code: ${cleanCode}`,
          text: `Your LUMA verification code is: ${cleanCode}\n\nPlease enter this 6-digit confirmation code in the verification screen to activate your account.\n\nThis code will expire in 15 minutes. If you did not request this verification code, please ignore this email.`,
          headers: {
            'X-Priority': '1',
            'Importance': 'High'
          },
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 36px 28px; border: 1px solid #e7e5e4; border-radius: 18px; background-color: #ffffff;">
              <div style="margin-bottom: 20px;">
                <span style="font-family: Georgia, serif; font-size: 26px; font-weight: 700; color: #1a1c1c; letter-spacing: -0.5px;">LUMA</span>
              </div>
              <h2 style="color: #1a1c1c; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 8px;">Your Verification Code</h2>
              <p style="color: #57534e; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">Please enter this 6-digit confirmation code on your screen to verify your email address and activate your account:</p>
              <div style="background-color: #fff7ed; border: 1.5px dashed #fdba74; padding: 22px; text-align: center; border-radius: 14px; margin-bottom: 24px;">
                <span style="font-family: monospace, Courier, sans-serif; font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #fd6b31;">${cleanCode}</span>
              </div>
              <p style="color: #78716c; font-size: 12px; line-height: 1.5; margin-bottom: 0;">This code will expire in 15 minutes. Never share this code with anyone. If you did not request this code, you can safely ignore this email.</p>
            </div>
          `
        });

        console.log(`[SMTP DELIVERED] Successfully sent 6-digit OTP code to ${cleanEmail}`);
        delivered = true;
      } catch (smtpErr: any) {
        console.warn("[SMTP NOTICE]", smtpErr.message);
      }
    }

    console.log(`[AUTH OTP DISPATCH] Destination: ${cleanEmail} | Delivered: ${delivered}`);
    // Security: Do NOT expose OTP code in response payload
    return res.json({
      success: true,
      delivered,
      email: cleanEmail,
      message: delivered ? "Verification code sent to your email." : "Verification code generated."
    });
  } catch (err: any) {
    console.error("Failed to process email OTP:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Email OTP Verification Endpoint
app.post("/api/auth/verify-email-otp", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ success: false, error: "Email and code are required" });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.toString().trim();

    const stored = activeOtps.get(cleanEmail);
    if (!stored || stored.expiresAt <= Date.now()) {
      return res.status(400).json({ success: false, valid: false, message: "Verification code expired or not found. Please request a new code." });
    }

    // Rate limiting: Maximum 5 failed attempts per OTP
    stored.attempts = (stored.attempts || 0) + 1;
    if (stored.attempts > 5) {
      activeOtps.delete(cleanEmail);
      return res.status(429).json({ success: false, valid: false, message: "Too many failed attempts. Please request a fresh code." });
    }

    if (stored.code === cleanCode) {
      // Mark user verified in DB
      try {
        if (isMongoConnected) {
          await UserModel.findOneAndUpdate({ email: cleanEmail }, { emailVerified: true, updatedAt: new Date() });
        }
        const memUser = memoryStore.users.find((u: any) => u.email === cleanEmail);
        if (memUser) memUser.emailVerified = true;
      } catch (_) {}

      activeOtps.delete(cleanEmail);
      return res.json({ success: true, valid: true });
    }

    return res.status(400).json({ success: false, valid: false, message: "Incorrect 6-digit confirmation code. Please check your email." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Proxy endpoints for resilient authentication when browser blocks identitytoolkit.googleapis.com
const FIREBASE_WEB_API_KEY = "AIzaSyAx5VixPbDY1uD-HvTX9bp9oKidqo-vabM";

app.post("/api/auth/register-proxy", async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName?.trim() || cleanEmail.split("@")[0];

    // 1. Call Identity Toolkit signUp
    let assignedUid = "luma_u_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    let signUpData: any = null;

    try {
      const signUpResp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_WEB_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password: password,
          returnSecureToken: true
        })
      });

      signUpData = await signUpResp.json();
      if (signUpResp.ok && signUpData.localId) {
        assignedUid = signUpData.localId;
        if (cleanName && signUpData.idToken) {
          fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_WEB_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idToken: signUpData.idToken,
              displayName: cleanName,
              returnSecureToken: true
            })
          }).catch(console.warn);
        }
      }
    } catch (fbErr: any) {
      console.warn("Firebase Identity Toolkit registration error (continuing with MongoDB persistence):", fbErr.message);
    }

    // 2. Persist user to MongoDB UserModel and MemoryStore for guaranteed future logins
    const userRecord = {
      uid: assignedUid,
      email: cleanEmail,
      password: password,
      displayName: cleanName,
      authProvider: "password",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    try {
      if (isMongoConnected) {
        await UserModel.findOneAndUpdate(
          { email: cleanEmail },
          userRecord,
          { upsert: true, new: true }
        );
      }
    } catch (dbErr) {
      console.warn("MongoDB user upsert notice:", dbErr);
    }

    const existingIdx = memoryStore.users.findIndex((u: any) => u.email === cleanEmail);
    if (existingIdx >= 0) {
      memoryStore.users[existingIdx] = userRecord;
    } else {
      memoryStore.users.push(userRecord);
    }

    // 3. Generate 6-digit OTP code & dispatch via Gmail SMTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    activeOtps.set(cleanEmail, {
      code: generatedOtp,
      expiresAt: Date.now() + 15 * 60 * 1000,
      attempts: 0
    });

    const smtpUser = process.env.SMTP_USER || "somshekar0003@gmail.com";
    const rawPass = process.env.SMTP_PASS || "cinr ghpi hega pxme";
    const smtpPass = rawPass.replace(/\s+/g, "");

    if (smtpUser && smtpPass) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = mailTransporter || nodemailer.createTransport({
          service: "gmail",
          pool: true,
          maxConnections: 3,
          auth: { user: smtpUser, pass: smtpPass }
        });
        mailTransporter = transporter;

        await transporter.sendMail({
          from: `"LUMA" <${smtpUser}>`,
          to: cleanEmail,
          subject: `Your LUMA Verification Code: ${generatedOtp}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 36px 28px; border: 1px solid #e7e5e4; border-radius: 18px; background-color: #ffffff;">
              <div style="margin-bottom: 20px;">
                <span style="font-family: serif; font-size: 24px; font-weight: 700; color: #1a1c1c; letter-spacing: -0.5px;">LUMA</span>
              </div>
              <h2 style="color: #1a1c1c; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 8px;">Your Verification Code</h2>
              <p style="color: #57534e; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">Please enter this 6-digit confirmation code to complete your registration:</p>
              <div style="background-color: #fff7ed; border: 1.5px dashed #fdba74; padding: 20px; text-align: center; border-radius: 14px; margin-bottom: 24px;">
                <span style="font-family: monospace; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #fd6b31;">${generatedOtp}</span>
              </div>
              <p style="color: #78716c; font-size: 12px; line-height: 1.4; margin-bottom: 0;">This code will expire in 15 minutes.</p>
            </div>
          `
        });
        console.log(`[PROXY REGISTER] Sent 6-digit OTP ${generatedOtp} to ${cleanEmail}`);
      } catch (e: any) {
        console.warn("[PROXY SMTP NOTICE]", e.message);
      }
    }

    return res.json({
      success: true,
      user: {
        uid: assignedUid,
        email: cleanEmail,
        displayName: cleanName,
        emailVerified: false
      }
    });
  } catch (err: any) {
    console.error("Register proxy failure:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/login-proxy", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Try Firebase Identity Toolkit first
    try {
      const signInResp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password: password,
          returnSecureToken: true
        })
      });

      const signInData: any = await signInResp.json();
      if (signInResp.ok && signInData.localId) {
        // Sync to MongoDB UserModel
        try {
          if (isMongoConnected) {
            await UserModel.findOneAndUpdate(
              { email: cleanEmail },
              {
                uid: signInData.localId,
                email: cleanEmail,
                displayName: signInData.displayName || cleanEmail.split("@")[0],
                updatedAt: new Date()
              },
              { upsert: true }
            );
          }
        } catch (_) {}

        return res.json({
          success: true,
          user: {
            uid: signInData.localId,
            email: signInData.email,
            displayName: signInData.displayName || cleanEmail.split("@")[0],
            emailVerified: true
          }
        });
      }
    } catch (fbErr: any) {
      console.warn("Firebase Identity Toolkit login attempt notice:", fbErr.message);
    }

    // 2. Check MongoDB UserModel & MemoryStore for persisted credentials
    let userDoc: any = null;
    try {
      if (isMongoConnected) {
        userDoc = await UserModel.findOne({ email: cleanEmail });
      }
    } catch (e) {
      console.warn("MongoDB user query notice:", e);
    }

    if (!userDoc) {
      userDoc = memoryStore.users.find((u: any) => u.email === cleanEmail);
    }

    if (userDoc) {
      if (userDoc.password && userDoc.password === password) {
        return res.json({
          success: true,
          user: {
            uid: userDoc.uid,
            email: userDoc.email,
            displayName: userDoc.displayName || cleanEmail.split("@")[0],
            emailVerified: true
          }
        });
      } else if (userDoc.password && userDoc.password !== password) {
        return res.status(400).json({
          success: false,
          code: "auth/invalid-credential",
          message: "Invalid password. Please check your credentials."
        });
      }
    }

    return res.status(400).json({
      success: false,
      code: "auth/invalid-credential",
      message: "Invalid email or password. Please check your credentials or create an account."
    });
  } catch (err: any) {
    console.error("Login proxy failure:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Google Account Sync Endpoint
app.post("/api/auth/google-sync", async (req, res) => {
  try {
    const { uid, email, displayName, photoURL } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUid = uid || ("google_" + Math.random().toString(36).substring(2, 10));
    const cleanName = displayName?.trim() || cleanEmail.split("@")[0];

    const googleUser = {
      uid: cleanUid,
      email: cleanEmail,
      displayName: cleanName,
      photoURL: photoURL || "",
      authProvider: "google",
      emailVerified: true,
      updatedAt: new Date()
    };

    try {
      if (isMongoConnected) {
        await UserModel.findOneAndUpdate(
          { email: cleanEmail },
          googleUser,
          { upsert: true, new: true }
        );
      }
    } catch (e) {
      console.warn("MongoDB Google sync notice:", e);
    }

    const idx = memoryStore.users.findIndex((u: any) => u.email === cleanEmail);
    if (idx >= 0) memoryStore.users[idx] = { ...memoryStore.users[idx], ...googleUser };
    else memoryStore.users.push(googleUser);

    return res.json({
      success: true,
      user: {
        uid: cleanUid,
        email: cleanEmail,
        displayName: cleanName,
        photoURL: photoURL || "",
        emailVerified: true
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/ai/quick-action", async (req, res) => {
  try {
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const { actionType, role, userPrompt, userName } = body;

    const safeRole = role || "Developer";
    const safeAction = actionType || "Daily Reflection";
    const safeName = userName || "Alex";

    const systemPrompt = `You are LUMA AI, an empathetic, high-leverage journaling and productivity companion for a ${safeRole}.
Your goal is to generate an authentic, structured, and insightful journal reflection based on the user's action: "${safeAction}".
Requirements:
1. Provide a sharp, inspiring Title (first line starting with "# ").
2. Write 2-3 structured paragraphs detailing key takeaways, reflections, and mindset.
3. Conclude with a 1-sentence "LUMA AI Insight:" summarizing their momentum.
Keep the tone thoughtful, professional, and inspiring.`;

    let content = "";
    try {
      if (process.env.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const fullPrompt = `${systemPrompt}\n\nUser Action: ${safeAction}\nContext: ${userPrompt || "Standard daily check-in"}\nUser Name: ${safeName}`;
        const result = await generateContentWithFallback(ai, fullPrompt);
        if (result && result.text) {
          content = result.text;
        }
      }
    } catch (aiErr: any) {
      console.warn("AI generation fallback activated:", aiErr?.message);
    }

    if (!content) {
      // Offline fallback templates mapped to specific action types
      if (safeAction.includes("code commits")) {
        content = `# Today's Code Commit Review & Architecture Takeaways\n\nReviewed today's branch commits and pull requests. Focused on hardening edge cases, keeping state synchronized in real time, and maintaining clean separation of concerns.\n\nKey realization: Writing declarative components backed by real-time reactive listeners dramatically reduces synchronization bugs.\n\nLUMA AI Insight: Steady iterative commits build compounding engineering velocity.`;
      } else if (safeAction.includes("standup")) {
        content = `# Daily Standup & Project Trajectory\n\nYesterday: Implemented core real-time Firebase subscriptions and purged static mock fallbacks.\nToday: Delivering the responsive My Journals view with live role adaptation and AI expansion.\nBlockers: None; progressing smoothly according to milestone specs.\n\nLUMA AI Insight: Clear daily standups sharpen team alignment and personal clarity.`;
      } else if (safeAction.includes("bug resolution")) {
        content = `# Bug Resolution Postmortem: Zero-Latency Data Sync\n\nDiagnosed and resolved potential data discrepancies by implementing snapshot listeners with resilient fallback handlers.\nRoot cause addressed: Ensure Firestore payloads strip undefined properties before write operations.\n\nLUMA AI Insight: Every bug documented becomes foundational wisdom for future architecture.`;
      } else {
        content = `# Daily Reflection: Continuous Growth & Momentum\n\nTook time to step back and assess current priorities. Balancing focused deep work with reflective pauses keeps momentum sustainable.\n\nFocused on delivering pristine craft, user empathy, and technical excellence today.\n\nLUMA AI Insight: Consistency in daily reflection turns small actions into extraordinary results.`;
      }
    }

    res.json({ success: true, content });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Vite Middleware Setup ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MERN + Firebase Enterprise Server running on http://localhost:${PORT}`);
  });
}

startServer();
