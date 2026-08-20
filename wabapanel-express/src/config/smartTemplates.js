// Pre-built template bodies for Smart Broadcast.
// Each has numbered variables ({{1}}..{{N}}) whose content is filled at send
// time with the user's own message lines. Bodies keep enough fixed text so
// Meta's "parameters words ratio" check passes on submission.

const SMART_TEMPLATES = [
  {
    key: 'details_9',
    title: 'Account Details (9 fields)',
    varCount: 9,
    body: `Hello Sir/Ma'am,

Greetings from our team. We are sharing the following important information with you for your records. Kindly take a moment to go through all the points mentioned below very carefully.

{{1}}
{{2}}
{{3}}
{{4}}
{{5}}
{{6}}
{{7}}
{{8}}

*Please find the details below for your reference.*
{{9}}

If you need any help or have any questions regarding the above information, please feel free to reply to this message and our support team will get back to you shortly.

🙂 Thanks for taking a moment to read this message. Have a great day ahead.`,
  },
  {
    key: 'summary_8',
    title: 'Detailed Summary (8 fields)',
    varCount: 8,
    body: `Hello,

We hope you are doing well. As part of our regular updates, we are sending you the following summary of information related to your account with us. Please review each of the points listed below at your convenience.

{{1}}
{{2}}
{{3}}
{{4}}
{{5}}
{{6}}
{{7}}

For your reference, please note: {{8}}

Should you require any clarification about any of the points mentioned above, simply reply to this message and a member of our team will be happy to assist you.

Thank you for your time and attention.`,
  },
  {
    key: 'record_7',
    title: 'Record Details (7 fields)',
    varCount: 7,
    body: `Hello Sir/Ma'am,

This message contains important details from our records that we would like to share with you today. We request you to kindly read through the complete information given below.

{{1}}
{{2}}
{{3}}
{{4}}
{{5}}
{{6}}

Details for your reference: {{7}}

In case anything mentioned above is unclear or you would like further assistance, please reply to this message and our team will respond as soon as possible.

Thank you very much for reading.`,
  },
  {
    key: 'update_6',
    title: 'Account Update (6 fields)',
    varCount: 6,
    body: `Hello,

We are writing to share an update regarding your account with us. The complete details of this update are mentioned in the points below. Kindly go through them once at your convenience.

{{1}}
{{2}}
{{3}}
{{4}}
{{5}}

For your reference: {{6}}

If you have any questions about this update or need any support from our side, please feel free to reply to this message at any time.

Thank you for your continued association with us.`,
  },
  {
    key: 'statement_5',
    title: 'Statement Summary (5 fields)',
    varCount: 5,
    body: `Dear Customer,

We hope this message finds you well. Please find your latest summary below, which has been prepared based on the most recent information available in our records.

{{1}}
{{2}}
{{3}}
{{4}}

Reference: {{5}}

If you notice anything that requires correction, or if you would like a detailed explanation of any item mentioned above, kindly reply to this message and our team will assist you promptly.

Warm regards.`,
  },
  {
    key: 'service_5',
    title: 'Service Update (5 fields)',
    varCount: 5,
    body: `Hello,

This is an important update related to the service associated with your account. We request you to please read the complete details mentioned in the points below.

{{1}}
{{2}}
{{3}}
{{4}}

Reference: {{5}}

For any assistance or questions regarding this service update, simply reply to this message and our support team will be glad to help you.

Thank you for your time.`,
  },
  {
    key: 'confirmation_4',
    title: 'Confirmation (4 fields)',
    varCount: 4,
    body: `Hello,

This message is a confirmation for your records. The relevant details of this confirmation are listed below for your convenience. Kindly review them once.

{{1}}
{{2}}
{{3}}

Details: {{4}}

If any of the information mentioned above appears incorrect, or if you have any questions, please reply to this message and we will look into it right away.

Thank you.`,
  },
  {
    key: 'reminder_4',
    title: 'Reminder (4 fields)',
    varCount: 4,
    body: `Dear Customer,

This is a gentle reminder from our team regarding the following matter related to your account. Please take a moment to read the details mentioned below.

{{1}}
{{2}}
{{3}}

More info: {{4}}

If you have already taken the necessary action, kindly ignore this reminder. For any assistance, feel free to reply to this message at any time.

Warm regards.`,
  },
  {
    key: 'followup_4',
    title: 'Follow-up (4 fields)',
    varCount: 4,
    body: `Dear Customer,

We are following up with you regarding your recent request with our team. The current status and related details are mentioned in the points below for your reference.

{{1}}
{{2}}
{{3}}

For reference: {{4}}

If there is anything more we can do to help you with this request, please reply to this message and we will be happy to assist you further.

Regards.`,
  },
  {
    key: 'notice_3',
    title: 'Notice (3 fields)',
    varCount: 3,
    body: `Hello,

Please take note of the following important details that we are sharing with you today for your information and records.

{{1}}
{{2}}

Reference: {{3}}

Should you have any questions about the details mentioned above, kindly reply to this message and our team will respond shortly.

Thank you.`,
  },
  {
    key: 'info_3',
    title: 'Information (3 fields)',
    varCount: 3,
    body: `Dear Sir/Ma'am,

Here is the information you requested from our team. We have listed the relevant details below for your convenience and reference.

{{1}}
{{2}}

For reference: {{3}}

If you need any further information or clarification, please feel free to reply to this message at any time.

Regards.`,
  },
  {
    key: 'general_2',
    title: 'General Note (2 fields)',
    varCount: 2,
    body: `Hello,

We are sharing the following note with you for your information and records. Kindly take a moment to read it.

{{1}}

For your reference: {{2}}

If you have any questions, please reply to this message and our team will assist you.

Thank you.`,
  },
];

const getSmartTemplate = (key) => SMART_TEMPLATES.find((t) => t.key === key) || null;

module.exports = { SMART_TEMPLATES, getSmartTemplate };
