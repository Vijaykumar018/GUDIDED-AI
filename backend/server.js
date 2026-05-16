const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Groq = require('groq-sdk');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const intents = {
  student: {
    name: "🎓 Student Assistant",
    dropdownOptions: [
      "Course Selection Advice",
      "Study Tips & Techniques",
      "Exam Preparation",
      "Career Guidance",
      "Scholarship Information",
      "Time Management"
    ],
    systemPrompt: "You are a professional student assistant. Provide practical, structured advice with specific details."
  },
  referrer: {
    name: "🤝 Referrer Assistant",
    dropdownOptions: [
      "Referral Program Details",
      "Commission Structure",
      "Marketing Materials",
      "Tracking Referrals",
      "Payment Process",
      "Best Practices"
    ],
    systemPrompt: "You are a professional referral program assistant. Provide structured, actionable guidance."
  },
  hr: {
    name: "💼 HR Assistant",
    dropdownOptions: [
      "Recruitment Process",
      "Employee Onboarding",
      "Performance Reviews",
      "Leave Policy",
      "Training Programs",
      "Employee Relations"
    ],
    systemPrompt: "You are a professional HR assistant. Provide structured, compliant HR guidance."
  },
  college: {
    name: "🏛️ College Administration",
    dropdownOptions: [
      "Admission Process",
      "Fee Structure",
      "Course Catalog",
      "Scholarship Programs",
      "Campus Facilities",
      "Placement Support"
    ],
    systemPrompt: "You are a professional college administrator. Provide structured, accurate information."
  }
};

app.get('/api/intents', (req, res) => {
  const intentsList = Object.keys(intents).map(key => ({
    id: key,
    name: intents[key].name,
    options: intents[key].dropdownOptions
  }));
  res.json(intentsList);
});

app.post('/api/followup', async (req, res) => {
  try {
    const { intent, category, lastQuestion, lastAnswer } = req.body;
    
    const prompt = `Based on this conversation:
User asked: "${lastQuestion}"
AI answered: "${lastAnswer}"

Generate 4 relevant follow-up questions that the user might want to ask next.
Return ONLY as a JSON array of strings.`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "Return ONLY valid JSON arrays of questions." },
        { role: "user", content: prompt }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 300,
    });
    
    let followupQuestions = [];
    try {
      let responseText = completion.choices[0]?.message?.content || '[]';
      responseText = responseText.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      followupQuestions = JSON.parse(responseText);
    } catch (e) {
      followupQuestions = [
        "Can you explain this in more detail?",
        "What are the key takeaways?",
        "Are there any best practices?",
        "Can you provide examples?"
      ];
    }
    
    res.json({ followup: followupQuestions.slice(0, 4) });
  } catch (error) {
    res.json({ followup: ["Tell me more", "Explain details", "Give examples", "Any tips?"] });
  }
});

app.get('/api/test', async (req, res) => {
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: "Say 'API is working!'" }],
      model: "llama-3.1-8b-instant",
      max_tokens: 50,
    });
    res.json({ success: true, response: completion.choices[0]?.message?.content });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { intent, category, userQuestion, conversationHistory } = req.body;
    
    const intentConfig = intents[intent];
    if (!intentConfig) {
      return res.status(400).json({ error: 'Invalid intent' });
    }
    
    const structuredPrompt = `${intentConfig.systemPrompt} 

Provide a DETAILED, SPECIFIC answer with concrete information.

FORMAT:
📌 Overview
[2-3 sentences introducing the topic]

🔹 Key Points
• Specific point 1 with details
• Specific point 2 with details
• Specific point 3 with details

📋 Important Details
• Include specific numbers, dates, requirements

✅ Summary
[Brief conclusion]

Topic: ${category}`;
    
    const userMsg = userQuestion || `Please provide detailed information about ${category}. Include specific numbers, dates, and requirements.`;
    
    const messages = [
      { role: "system", content: structuredPrompt },
      { role: "user", content: userMsg }
    ];
    
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-8);
      messages.splice(1, 0, ...recentHistory);
    }
    
    const completion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 1000,
    });
    
    const aiResponse = completion.choices[0]?.message?.content;
    
    if (!aiResponse) {
      return res.status(500).json({ error: 'Empty response from AI' });
    }
    
    res.json({ response: aiResponse });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Failed to get response from AI',
      details: error.message
    });
  }
});

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Root route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Catch-all route for any other request (client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});