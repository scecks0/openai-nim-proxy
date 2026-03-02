const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

const MODEL_MAPPING = {
  'deepseek': 'deepseek-ai/deepseek-v3.1',
  'gpt-3.5-turbo': 'deepseek-ai/deepseek-v3.1',
  'gpt-4': 'deepseek-ai/deepseek-v3.1',
  'gpt-4-turbo': 'deepseek-ai/deepseek-v3.1',
  'gpt-4o': 'deepseek-ai/deepseek-v3.1',
  'claude-3-opus': 'deepseek-ai/deepseek-v3.1',
  'claude-3-sonnet': 'deepseek-ai/deepseek-v3.1',
  'gemini-pro': 'deepseek-ai/deepseek-v3.1'
};

app.all('/', (req, res) => {
  res.json({ status: 'ok', service: 'OpenAI to NVIDIA NIM Proxy' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'OpenAI to NVIDIA NIM Proxy', api_key_set: !!NIM_API_KEY });
});

app.get('/v1/models', (req, res) => {
  const models = Object.keys(MODEL_MAPPING).map(model => ({
    id: model,
    object: 'model',
    created: Date.now(),
    owned_by: 'nvidia-nim-proxy'
  }));
  res.json({ object: 'list', data: models });
});

app.post('/v1/chat/completions', async (req, res) => {
  console.log('Incoming request - Model:', req.body.model);
  try {
    const { model, messages, temperature, max_tokens } = req.body;
    const nimModel = MODEL_MAPPING[model] || 'deepseek-ai/deepseek-v3.1';
    console.log('Mapped to:', nimModel);

    const nimRequest = {
      model: nimModel,
      messages: messages,
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: 8192,
      stream: false
    };

    console.log('Calling NVIDIA API...');
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('NVIDIA response status:', response.status);

    const openaiResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: response.data.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content || ''
        },
        finish_reason: choice.finish_reason
      })),
      usage: response.data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    res.json(openaiResponse);

  } catch (error) {
    console.error('Proxy error:', error.message);
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data));
    res.status(error.response?.status || 500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'invalid_request_error',
        code: error.response?.status || 500
      }
    });
  }
});

app.all('*', (req, res) => {
  res.status(404).json({
    error: {
      message: `Endpoint ${req.path} not found`,
      type: 'invalid_request_error',
      code: 404
    }
  });
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
  console.log(`API Key set: ${!!NIM_API_KEY}`);
});
