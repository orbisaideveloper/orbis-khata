import type { Language } from '../i18n';
import './privacy.css';
const copy = {
 en: ['Privacy and account deletion', 'Privacy Policy', 'Request account/data deletion', 'Email a request from your registered address. Support verifies identity and ownership before deleting account and associated data. Opening email does not submit or complete deletion; press Send in your email app.', 'Compose deletion request', 'Khata-only and shared Orbis account deletion have different scopes. Confirm other-product impact with support.'],
 bn: ['গোপনীয়তা ও অ্যাকাউন্ট মোছা', 'Privacy Policy', 'অ্যাকাউন্ট/তথ্য মোছার অনুরোধ', 'নিবন্ধিত email থেকে অনুরোধ পাঠান। Support পরিচয় ও মালিকানা যাচাই করে অ্যাকাউন্ট ও সংশ্লিষ্ট তথ্য মোছার ব্যবস্থা করবে। Email খোলা মানে অনুরোধ পাঠানো বা তথ্য মোছা নয়; email app-এ Send চাপতে হবে।', 'মোছার অনুরোধ লিখুন', 'শুধু Khata এবং shared Orbis account মোছার scope আলাদা। অন্য পণ্যের প্রভাব আগে support-এর সঙ্গে নিশ্চিত করুন।'],
 hi: ['गोपनीयता और अकाउंट मिटाना', 'Privacy Policy', 'अकाउंट/डेटा मिटाने का अनुरोध', 'पंजीकृत ईमेल से अनुरोध भेजें। Support पहचान और स्वामित्व जाँचकर अकाउंट और संबंधित डेटा मिटाने की व्यवस्था करता है। ईमेल खोलने से अनुरोध भेजा या डेटा मिटाया नहीं जाता; ईमेल ऐप में Send दबाएँ।', 'मिटाने का अनुरोध लिखें', 'केवल Khata और साझा Orbis अकाउंट मिटाने का दायरा अलग है। अन्य उत्पादों पर प्रभाव पहले support से स्पष्ट करें।'],
};
const contact = 'orbisaideveloper@gmail.com';
const mail = 'mailto:' + contact + '?subject=' + encodeURIComponent('Khata Boi account and data deletion request') + '&body=' + encodeURIComponent('Please delete my Khata Boi account and associated personal and owned business data.\nRegistered email / Orbis ID:\nCompany / requested scope:\nPlease explain any necessary retention and expiry. Do not send passwords or OTPs.');
export function PrivacyLinks({language, detailed = false}: Readonly<{language:Language; detailed?:boolean}>) {
 const t = copy[language];
 return <section className="privacy-links" aria-label={t[0]}>
 <nav aria-label={t[0]}><a href="https://orbis-khata.onrender.com/privacy.html" target="_blank" rel="noopener noreferrer">{t[1]}</a><a href="https://orbis-khata.onrender.com/delete-account.html" target="_blank" rel="noopener noreferrer">{t[2]}</a></nav>
 {detailed && <><p>{t[3]}</p><a href={mail}>{t[4]}</a><p>{contact}</p><p>{t[5]}</p></>}
 </section>;
}
