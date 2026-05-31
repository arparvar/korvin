const fs = require('fs');
const path = require('node:path');

const BASE_URL = process.env.SUPERTONIC_URL || 'http://127.0.0.1:7788';

const testCases = [
  { name: 'greeting', input: 'Hello! How can I assist you today?' },
  { name: 'long-sentence', input: 'The quick brown fox jumps over the lazy dog and then proceeds to do it again several times just to make absolutely sure.' },
  { name: 'markdown-stripped', input: 'This is **important** and this is `code` and this is *italic* text.' },
  { name: 'numbers', input: 'Your token usage today is 12,345 tokens costing approximately 0.0034 US dollars.' },
  { name: 'question', input: 'What would you like me to help you with?' },
  { name: 'multilingual-name', input: 'I am Korvin, your personal AI agent. Nice to meet you, Carlos.' },
];

function stripMarkdown(input) {
  return input
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1');
}

function isRiffWav(buffer) {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  );
}

function isConnectionRefused(error) {
  return error && (
    error.code === 'ECONNREFUSED' ||
    error.cause?.code === 'ECONNREFUSED' ||
    /ECONNREFUSED/i.test(String(error.message))
  );
}

(async () => {
  let passed = 0;
  const speechUrl = `${BASE_URL}/v1/audio/speech`;

  fs.mkdirSync('/tmp', { recursive: true });

  try {
    for (const testCase of testCases) {
      const input = stripMarkdown(testCase.input);
      const response = await fetch(speechUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'supertonic-3',
          input,
          voice: 'M1',
          response_format: 'wav',
        }),
      });

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const failures = [];

      if (!response.ok) {
        failures.push(`status=${response.status}`);
      }
      if (buffer.length === 0) {
        failures.push('empty-body');
      }
      if (buffer.length <= 1000) {
        failures.push(`bytes=${buffer.length}`);
      }
      if (!isRiffWav(buffer)) {
        failures.push('missing-RIFF-header');
      }

      if (failures.length === 0) {
        const outputPath = path.join('/tmp', `supertonic-test-${testCase.name}.wav`);
        fs.writeFileSync(outputPath, buffer);
        passed += 1;
        console.log(`[PASS] ${testCase.name} status=${response.status} bytes=${buffer.length} file=${outputPath}`);
      } else {
        console.log(`[FAIL] ${testCase.name} ${failures.join(' ')}`);
      }
    }
  } catch (error) {
    if (isConnectionRefused(error)) {
      console.log(`Supertonic is unreachable at ${BASE_URL}: connection refused. Start the Supertonic 3 TTS server or set SUPERTONIC_URL.`);
      process.exit(2);
    }

    console.log(`[FAIL] unexpected-error ${error && error.stack ? error.stack : error}`);
    process.exit(1);
  }

  console.log(`Results: ${passed}/${testCases.length} passed`);
  process.exit(passed === testCases.length ? 0 : 1);
})();
