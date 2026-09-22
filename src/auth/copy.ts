import type { Language } from '../i18n'

const en = {
  login: 'Log in', signup: 'Create account', first: 'First name', last: 'Last name',
  phone: 'Phone number', email: 'Email', password: 'Password', forgot: 'Forgot password?',
  recover: 'Send recovery link', newPassword: 'New password', save: 'Save password',
  logout: 'Log out', waiting: 'Please wait…', error: 'Could not complete the request. Check your connection and try again.',
  credentials: 'Email or password is incorrect.', exists: 'This account already exists. Log in or recover your password.',
  rate: 'Too many attempts. Please wait before trying again.',
  blocked: 'Signup did not open a session. Contact support; do not create another account.',
  sent: 'If recovery is available for this email, a link will arrive. Check your inbox and spam folder.',
  persistent: 'Stay logged in on this device. Email and phone verification are not required to get started.',
  config: 'Login is not configured yet.', lock: 'App lock: Off', lockInfo: 'Optional device lock will be available in a future update.',
  company: 'Your company', companyName: 'Company name', createCompany: 'Create company',
  loadError: 'Company could not be loaded. Retry when connected.', retry: 'Retry',
  companySetup: 'Create your company to start your khata.', network: 'Connecting…',
}
type Copy = typeof en
const bn: Copy = {
  login: 'লগইন', signup: 'অ্যাকাউন্ট তৈরি করুন', first: 'প্রথম নাম', last: 'পদবি',
  phone: 'ফোন নম্বর', email: 'ইমেইল', password: 'পাসওয়ার্ড', forgot: 'পাসওয়ার্ড ভুলে গেছেন?',
  recover: 'রিকভারি লিংক পাঠান', newPassword: 'নতুন পাসওয়ার্ড', save: 'পাসওয়ার্ড সেভ করুন',
  logout: 'লগআউট', waiting: 'অপেক্ষা করুন…', error: 'কাজটি সম্পন্ন হয়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।',
  credentials: 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।', exists: 'অ্যাকাউন্টটি আগে থেকেই আছে। লগইন বা পাসওয়ার্ড রিকভারি করুন।',
  rate: 'অনেকবার চেষ্টা হয়েছে। একটু পরে আবার চেষ্টা করুন।',
  blocked: 'Signup-এর পরে session খোলেনি। সহায়তা নিন; আবার নতুন অ্যাকাউন্ট তৈরি করবেন না।',
  sent: 'এই ইমেইলে রিকভারি সম্ভব হলে লিংক আসবে। Inbox ও Spam দেখুন।',
  persistent: 'এই ডিভাইসে লগইন থাকবে। শুরু করতে ইমেইল বা ফোন ভেরিফিকেশন লাগবে না।',
  config: 'লগইন এখনও কনফিগার করা হয়নি।', lock: 'App lock: বন্ধ', lockInfo: 'ঐচ্ছিক device lock ভবিষ্যতের আপডেটে আসবে।',
  company: 'আপনার কোম্পানি', companyName: 'কোম্পানির নাম', createCompany: 'কোম্পানি তৈরি করুন',
  loadError: 'কোম্পানি লোড হয়নি। সংযোগ ফিরে এলে আবার চেষ্টা করুন।', retry: 'আবার চেষ্টা করুন',
  companySetup: 'খাতা শুরু করতে আপনার কোম্পানি তৈরি করুন।', network: 'সংযোগ হচ্ছে…',
}
const hi: Copy = {
  login: 'लॉग इन', signup: 'खाता बनाएँ', first: 'पहला नाम', last: 'उपनाम',
  phone: 'फ़ोन नंबर', email: 'ईमेल', password: 'पासवर्ड', forgot: 'पासवर्ड भूल गए?',
  recover: 'रिकवरी लिंक भेजें', newPassword: 'नया पासवर्ड', save: 'पासवर्ड सहेजें',
  logout: 'लॉग आउट', waiting: 'कृपया प्रतीक्षा करें…', error: 'अनुरोध पूरा नहीं हुआ। कनेक्शन जाँचकर फिर कोशिश करें।',
  credentials: 'ईमेल या पासवर्ड गलत है।', exists: 'खाता पहले से मौजूद है। लॉग इन करें या पासवर्ड वापस पाएँ।',
  rate: 'बहुत अधिक प्रयास हुए। थोड़ी देर बाद कोशिश करें।',
  blocked: 'Signup के बाद session नहीं खुला। सहायता लें; दूसरा खाता न बनाएँ।',
  sent: 'इस ईमेल के लिए रिकवरी उपलब्ध होने पर लिंक आएगा। Inbox और Spam देखें।',
  persistent: 'इस डिवाइस पर लॉग इन रहेगा। शुरू करने के लिए ईमेल या फ़ोन सत्यापन ज़रूरी नहीं है।',
  config: 'लॉग इन अभी कॉन्फ़िगर नहीं हुआ है।', lock: 'App lock: बंद', lockInfo: 'वैकल्पिक device lock भविष्य के अपडेट में आएगा।',
  company: 'आपकी कंपनी', companyName: 'कंपनी का नाम', createCompany: 'कंपनी बनाएँ',
  loadError: 'कंपनी लोड नहीं हुई। कनेक्शन आने पर फिर कोशिश करें।', retry: 'फिर कोशिश करें',
  companySetup: 'खाता शुरू करने के लिए अपनी कंपनी बनाएँ।', network: 'कनेक्ट हो रहा है…',
}
export const accountCopy: Record<Language, Copy> = { en, bn, hi }

export function accountError(code: string | undefined, language: Language) {
  const text = accountCopy[language]
  if (code === 'invalid_credentials') return text.credentials
  if (code === 'user_already_exists' || code === 'email_exists') return text.exists
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return text.rate
  return text.error
}
