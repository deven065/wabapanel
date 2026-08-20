'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Lightweight i18n: English is the source language. Translations are looked up
// by the English string. Unknown strings fall back to English. Panel menu /
// navigation labels are translated for a set of major world languages.

export const LANGUAGES: { code: string; name: string; dir?: 'rtl' }[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文' },
];

// Ordered list of English keys used across the sidebar / menu.
const KEYS = [
  'Dashboard', 'Analytics', 'Inbox', 'WhatsApp Inbox', 'Instagram Inbox', 'Facebook Inbox',
  'Telegram Inbox', 'Email Inbox', 'Contacts', 'Contact Directory', 'Segments', 'Tags',
  'Data Fields', 'Import Logs', 'Badges', 'Pipeline Board', 'Campaigns', 'Message Templates',
  'Broadcast', 'Drip Campaigns', 'Save Money', 'Preset Templates', 'Preset Campaigns',
  'Automation', 'Automation Flows', 'Bot Flow Builder', 'AI Follow-ups', 'Flow Builder',
  'Quick Replies', 'Keyword Triggers', 'Appointments', 'Tickets', 'Events', 'Predefined Actions',
  'Response Resources', 'Leads & Commerce', 'Lead Gen Forms', 'Facebook Leads', 'Product Catalogs',
  'Order Management', 'Short Links', 'Channels', 'Channel Config', 'WhatsApp Settings', 'Settings',
  'Organization Teams', 'Agents', 'Integrations', 'Chat Appearance', 'AI Settings',
  'AI Calling Settings', 'Knowledge Base', 'Audit Log', 'Business Settings', 'Toolset',
  'Subscription & Plans', 'Subscription Plans', 'Billing & Plans', 'Wallet Credits', 'Transactions',
  'Invoices', 'Media Library', 'CTWA Ads', 'API & Developers', 'Search...', 'Search menu...',
  'Logout', 'Notifications', 'No recent activity', 'Loading...',
];

// Translations per language, index-aligned with KEYS. Missing entries fall back to English.
const TABLES: Record<string, string[]> = {
  hi: ['डैशबोर्ड','एनालिटिक्स','इनबॉक्स','व्हाट्सएप इनबॉक्स','इंस्टाग्राम इनबॉक्स','फेसबुक इनबॉक्स','टेलीग्राम इनबॉक्स','ईमेल इनबॉक्स','संपर्क','संपर्क सूची','सेगमेंट','टैग','डेटा फ़ील्ड','इम्पोर्ट लॉग','बैज','पाइपलाइन बोर्ड','कैंपेन','मैसेज टेम्पलेट','ब्रॉडकास्ट','ड्रिप कैंपेन','पैसे बचाएं','प्रीसेट टेम्पलेट','प्रीसेट कैंपेन','ऑटोमेशन','ऑटोमेशन फ़्लो','बॉट फ़्लो बिल्डर','AI फ़ॉलो-अप','फ़्लो बिल्डर','त्वरित उत्तर','कीवर्ड ट्रिगर','अपॉइंटमेंट','टिकट','इवेंट','पूर्वनिर्धारित क्रियाएं','रिस्पॉन्स संसाधन','लीड और कॉमर्स','लीड जनरेशन फ़ॉर्म','फेसबुक लीड','प्रोडक्ट कैटलॉग','ऑर्डर प्रबंधन','शॉर्ट लिंक','चैनल','चैनल कॉन्फ़िगरेशन','व्हाट्सएप सेटिंग्स','सेटिंग्स','संगठन टीमें','एजेंट','इंटीग्रेशन','चैट अपीयरेंस','AI सेटिंग्स','AI कॉलिंग सेटिंग्स','नॉलेज बेस','ऑडिट लॉग','वर्कस्पेस सेटिंग्स','टूलसेट','सब्सक्रिप्शन और प्लान','सब्सक्रिप्शन प्लान','बिलिंग और प्लान','वॉलेट क्रेडिट','लेन-देन','इनवॉइस','मीडिया लाइब्रेरी','CTWA विज्ञापन','API और डेवलपर्स','खोजें...','मेनू खोजें...','लॉगआउट','सूचनाएं','कोई हालिया गतिविधि नहीं','लोड हो रहा है...'],
  es: ['Panel','Analíticas','Bandeja de entrada','Bandeja WhatsApp','Bandeja Instagram','Bandeja Facebook','Bandeja Telegram','Bandeja de correo','Contactos','Directorio de contactos','Segmentos','Etiquetas','Campos de datos','Registros de importación','Insignias','Tablero de pipeline','Campañas','Plantillas de mensajes','Difusión','Campañas de goteo','Ahorrar dinero','Plantillas predefinidas','Campañas predefinidas','Automatización','Flujos de automatización','Constructor de bots','Seguimientos IA','Constructor de flujos','Respuestas rápidas','Disparadores por palabra','Citas','Tickets','Eventos','Acciones predefinidas','Recursos de respuesta','Leads y comercio','Formularios de leads','Leads de Facebook','Catálogos de productos','Gestión de pedidos','Enlaces cortos','Canales','Configuración de canal','Ajustes de WhatsApp','Ajustes','Equipos','Agentes','Integraciones','Apariencia del chat','Ajustes de IA','Ajustes de llamadas IA','Base de conocimiento','Registro de auditoría','Ajustes del espacio','Herramientas','Suscripción y planes','Planes de suscripción','Facturación y planes','Créditos de billetera','Transacciones','Facturas','Biblioteca multimedia','Anuncios CTWA','API y desarrolladores','Buscar...','Buscar menú...','Cerrar sesión','Notificaciones','Sin actividad reciente','Cargando...'],
  pt: ['Painel','Análises','Caixa de entrada','Caixa WhatsApp','Caixa Instagram','Caixa Facebook','Caixa Telegram','Caixa de e-mail','Contatos','Diretório de contatos','Segmentos','Etiquetas','Campos de dados','Registros de importação','Emblemas','Quadro de pipeline','Campanhas','Modelos de mensagem','Transmissão','Campanhas de gotejamento','Economizar','Modelos predefinidos','Campanhas predefinidas','Automação','Fluxos de automação','Construtor de bots','Follow-ups de IA','Construtor de fluxos','Respostas rápidas','Gatilhos por palavra','Agendamentos','Tickets','Eventos','Ações predefinidas','Recursos de resposta','Leads e comércio','Formulários de leads','Leads do Facebook','Catálogos de produtos','Gestão de pedidos','Links curtos','Canais','Configuração de canal','Configurações do WhatsApp','Configurações','Equipes','Agentes','Integrações','Aparência do chat','Configurações de IA','Configurações de chamadas IA','Base de conhecimento','Registro de auditoria','Configurações do workspace','Ferramentas','Assinatura e planos','Planos de assinatura','Cobrança e planos','Créditos da carteira','Transações','Faturas','Biblioteca de mídia','Anúncios CTWA','API e desenvolvedores','Pesquisar...','Pesquisar menu...','Sair','Notificações','Sem atividade recente','Carregando...'],
  fr: ['Tableau de bord','Analyses','Boîte de réception','Boîte WhatsApp','Boîte Instagram','Boîte Facebook','Boîte Telegram','Boîte e-mail','Contacts','Répertoire de contacts','Segments','Étiquettes','Champs de données','Journaux d\'import','Badges','Tableau du pipeline','Campagnes','Modèles de message','Diffusion','Campagnes goutte-à-goutte','Économiser','Modèles prédéfinis','Campagnes prédéfinies','Automatisation','Flux d\'automatisation','Constructeur de bots','Relances IA','Constructeur de flux','Réponses rapides','Déclencheurs par mot-clé','Rendez-vous','Tickets','Événements','Actions prédéfinies','Ressources de réponse','Leads et commerce','Formulaires de leads','Leads Facebook','Catalogues produits','Gestion des commandes','Liens courts','Canaux','Configuration du canal','Paramètres WhatsApp','Paramètres','Équipes','Agents','Intégrations','Apparence du chat','Paramètres IA','Paramètres des appels IA','Base de connaissances','Journal d\'audit','Paramètres de l\'espace','Outils','Abonnement et forfaits','Forfaits d\'abonnement','Facturation et forfaits','Crédits du portefeuille','Transactions','Factures','Bibliothèque multimédia','Publicités CTWA','API et développeurs','Rechercher...','Rechercher dans le menu...','Déconnexion','Notifications','Aucune activité récente','Chargement...'],
  de: ['Dashboard','Analysen','Posteingang','WhatsApp-Posteingang','Instagram-Posteingang','Facebook-Posteingang','Telegram-Posteingang','E-Mail-Posteingang','Kontakte','Kontaktverzeichnis','Segmente','Tags','Datenfelder','Importprotokolle','Abzeichen','Pipeline-Board','Kampagnen','Nachrichtenvorlagen','Rundnachricht','Drip-Kampagnen','Geld sparen','Vorgefertigte Vorlagen','Vorgefertigte Kampagnen','Automatisierung','Automatisierungsabläufe','Bot-Flow-Builder','KI-Nachfassaktionen','Flow-Builder','Schnellantworten','Schlüsselwort-Trigger','Termine','Tickets','Ereignisse','Vordefinierte Aktionen','Antwortressourcen','Leads & Handel','Lead-Formulare','Facebook-Leads','Produktkataloge','Bestellverwaltung','Kurzlinks','Kanäle','Kanalkonfiguration','WhatsApp-Einstellungen','Einstellungen','Teams','Agenten','Integrationen','Chat-Erscheinungsbild','KI-Einstellungen','KI-Anruf-Einstellungen','Wissensdatenbank','Audit-Protokoll','Workspace-Einstellungen','Werkzeuge','Abo & Tarife','Abo-Tarife','Abrechnung & Tarife','Wallet-Guthaben','Transaktionen','Rechnungen','Medienbibliothek','CTWA-Anzeigen','API & Entwickler','Suchen...','Menü durchsuchen...','Abmelden','Benachrichtigungen','Keine aktuelle Aktivität','Wird geladen...'],
  ar: ['لوحة التحكم','التحليلات','صندوق الوارد','وارد واتساب','وارد إنستغرام','وارد فيسبوك','وارد تيليجرام','وارد البريد','جهات الاتصال','دليل جهات الاتصال','الشرائح','الوسوم','حقول البيانات','سجلات الاستيراد','الشارات','لوحة المسار','الحملات','قوالب الرسائل','بث','حملات التنقيط','توفير المال','قوالب جاهزة','حملات جاهزة','الأتمتة','مسارات الأتمتة','منشئ الروبوت','متابعات الذكاء الاصطناعي','منشئ المسار','الردود السريعة','مشغلات الكلمات','المواعيد','التذاكر','الأحداث','إجراءات محددة','موارد الرد','العملاء والتجارة','نماذج العملاء','عملاء فيسبوك','كتالوجات المنتجات','إدارة الطلبات','روابط قصيرة','القنوات','إعداد القناة','إعدادات واتساب','الإعدادات','الفرق','الوكلاء','عمليات الدمج','مظهر الدردشة','إعدادات الذكاء الاصطناعي','إعدادات مكالمات الذكاء الاصطناعي','قاعدة المعرفة','سجل التدقيق','إعدادات مساحة العمل','الأدوات','الاشتراك والخطط','خطط الاشتراك','الفوترة والخطط','رصيد المحفظة','المعاملات','الفواتير','مكتبة الوسائط','إعلانات CTWA','واجهة برمجة التطبيقات والمطورون','بحث...','بحث في القائمة...','تسجيل الخروج','الإشعارات','لا يوجد نشاط حديث','جارٍ التحميل...'],
  id: ['Dasbor','Analitik','Kotak masuk','Kotak masuk WhatsApp','Kotak masuk Instagram','Kotak masuk Facebook','Kotak masuk Telegram','Kotak masuk Email','Kontak','Direktori kontak','Segmen','Tag','Bidang data','Log impor','Lencana','Papan pipeline','Kampanye','Templat pesan','Siaran','Kampanye tetes','Hemat uang','Templat preset','Kampanye preset','Otomatisasi','Alur otomatisasi','Pembuat bot','Tindak lanjut AI','Pembuat alur','Balasan cepat','Pemicu kata kunci','Janji temu','Tiket','Acara','Tindakan standar','Sumber balasan','Prospek & Perdagangan','Formulir prospek','Prospek Facebook','Katalog produk','Manajemen pesanan','Tautan pendek','Saluran','Konfigurasi saluran','Pengaturan WhatsApp','Pengaturan','Tim','Agen','Integrasi','Tampilan obrolan','Pengaturan AI','Pengaturan panggilan AI','Basis pengetahuan','Log audit','Pengaturan workspace','Peralatan','Langganan & Paket','Paket langganan','Tagihan & Paket','Kredit dompet','Transaksi','Faktur','Perpustakaan media','Iklan CTWA','API & Pengembang','Cari...','Cari menu...','Keluar','Notifikasi','Tidak ada aktivitas terbaru','Memuat...'],
  ru: ['Панель','Аналитика','Входящие','WhatsApp входящие','Instagram входящие','Facebook входящие','Telegram входящие','Входящая почта','Контакты','Каталог контактов','Сегменты','Метки','Поля данных','Журналы импорта','Значки','Доска воронки','Кампании','Шаблоны сообщений','Рассылка','Капельные кампании','Экономия','Готовые шаблоны','Готовые кампании','Автоматизация','Потоки автоматизации','Конструктор ботов','ИИ-дожимы','Конструктор потоков','Быстрые ответы','Триггеры по словам','Встречи','Тикеты','События','Заданные действия','Ресурсы ответов','Лиды и коммерция','Формы лидов','Лиды Facebook','Каталоги товаров','Управление заказами','Короткие ссылки','Каналы','Настройка канала','Настройки WhatsApp','Настройки','Команды','Агенты','Интеграции','Внешний вид чата','Настройки ИИ','Настройки ИИ-звонков','База знаний','Журнал аудита','Настройки рабочей области','Инструменты','Подписка и тарифы','Тарифы подписки','Оплата и тарифы','Кредиты кошелька','Транзакции','Счета','Медиатека','Реклама CTWA','API и разработчики','Поиск...','Поиск по меню...','Выйти','Уведомления','Нет недавней активности','Загрузка...'],
  zh: ['仪表板','分析','收件箱','WhatsApp 收件箱','Instagram 收件箱','Facebook 收件箱','Telegram 收件箱','电子邮件收件箱','联系人','联系人目录','分组','标签','数据字段','导入日志','徽章','管道看板','营销活动','消息模板','群发','滴灌营销','省钱','预设模板','预设营销','自动化','自动化流程','机器人流程构建器','AI 跟进','流程构建器','快捷回复','关键词触发','预约','工单','事件','预定义操作','回复资源','潜在客户与商务','潜在客户表单','Facebook 潜在客户','产品目录','订单管理','短链接','渠道','渠道配置','WhatsApp 设置','设置','团队','客服','集成','聊天外观','AI 设置','AI 通话设置','知识库','审计日志','工作区设置','工具集','订阅与套餐','订阅套餐','账单与套餐','钱包余额','交易','发票','媒体库','CTWA 广告','API 与开发者','搜索...','搜索菜单...','退出登录','通知','暂无最近活动','加载中...'],
};

function buildDict(codes: string[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const code of codes) {
    const table = TABLES[code];
    if (!table) continue;
    const m: Record<string, string> = {};
    KEYS.forEach((k, i) => { if (table[i]) m[k] = table[i]; });
    out[code] = m;
  }
  return out;
}

const DICT = buildDict(Object.keys(TABLES));

const I18nContext = createContext<{ lang: string; setLang: (l: string) => void; t: (s: string) => string }>({
  lang: 'en', setLang: () => {}, t: (s) => s,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState('en');
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('panel_lang') : null;
    if (saved && (saved === 'en' || DICT[saved])) setLangState(saved);
  }, []);
  useEffect(() => {
    const l = LANGUAGES.find(x => x.code === lang);
    if (typeof document !== 'undefined') document.documentElement.dir = l?.dir === 'rtl' ? 'rtl' : 'ltr';
  }, [lang]);
  const setLang = useCallback((l: string) => {
    setLangState(l);
    try { localStorage.setItem('panel_lang', l); } catch { /* empty */ }
  }, []);
  const t = useCallback((s: string) => (lang !== 'en' && DICT[lang] ? (DICT[lang][s] || s) : s), [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
