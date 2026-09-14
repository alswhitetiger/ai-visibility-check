import { askAI } from './ai.js';
import { draftFacts } from './draft.js';

export const interviewQuestions = [
  ['offering', '무엇을 판매하거나 제공하나요?'],
  ['details', '상품·서비스의 핵심 특징이나 이용 조건은 무엇인가요?'],
  ['cost', '가격과 추가 비용은 어떻게 되나요?'],
  ['delivery', '배송 또는 서비스 제공은 어떻게 진행되나요?'],
  ['support', '교환·환불과 문의는 어떻게 처리하나요?'],
];

function cleanAnswers(value) {
  if (!Array.isArray(value?.answers) || value.answers.length !== interviewQuestions.length) throw new Error('INVALID_INTERVIEW');
  return interviewQuestions.map(([id]) => {
    const item = value.answers.find(answer => answer?.id === id);
    if (!item || typeof item.answer !== 'string' || !item.answer.trim() || item.answer.length > 800) throw new Error('INVALID_INTERVIEW');
    return { id, answer: item.answer.trim() };
  });
}

function validateResult(value) {
  if (typeof value?.about !== 'string' || !value.about.trim() || value.about.length > 600 || !Array.isArray(value.faq) || value.faq.length !== 3) throw new Error('INVALID_INTERVIEW_RESULT');
  const faq = value.faq.map(item => {
    if (typeof item.question !== 'string' || !item.question.trim() || item.question.length > 160 || typeof item.answer !== 'string' || !item.answer.trim() || item.answer.length > 800) throw new Error('INVALID_INTERVIEW_RESULT');
    return { question: item.question.trim(), answer: item.answer.trim() };
  });
  return { about: value.about.trim(), faq };
}

export async function generateInterview(env, scan, input) {
  const answers = cleanAnswers(input), facts = draftFacts(scan);
  const result = await askAI(env, {
    system: '운영자의 답변과 페이지 자료를 바탕으로 쇼핑몰 소개와 FAQ 초안을 작성하세요. 입력 자료에 없는 가격, 배송, 효능, 인증, 보장 내용을 추가하지 마세요. 운영자 답변이 우선 근거이며 애매한 내용은 단정하지 마세요. 한국어 JSON만 반환하세요. 형식: {"about":"600자 이내 소개","faq":[{"question":"질문","answer":"답변"},{"question":"질문","answer":"답변"},{"question":"질문","answer":"답변"}]}',
    user: JSON.stringify({ facts, answers }),
  });
  if (!result.ok) return { error: 'AI_UNAVAILABLE', message: '운영자 답변 초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  try {
    const value = validateResult(result.json);
    const faqJsonLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: value.faq.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) }, null, 2);
    return { ...value, faqJsonLd, provider: result.provider, model: result.model, generatedAt: Date.now() };
  } catch {
    return { error: 'INVALID_INTERVIEW_RESULT', message: 'AI 초안 형식을 검증하지 못했습니다. 다시 시도해 주세요.' };
  }
}
