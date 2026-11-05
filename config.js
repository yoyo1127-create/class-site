// ===============================================
//  הגדרות אתר הכיתה — זה הקובץ היחיד שצריך לערוך
// ===============================================
// כל עוד sheetId ו-calendarId ריקים, האתר מציג נתוני הדגמה.
// הסבר מלא איך למלא כל שדה נמצא בקובץ "מדריך-התקנה.md".

window.CLASS_CONFIG = {
  // שם הכיתה שיופיע בראש האתר
  className: "כיתה ה'2",

  // שם בית הספר (לא חובה)
  schoolName: "בית ספר אור זבולון, אריאל",

  // המזהה של ה-Google Sheet (החלק הארוך בכתובת שבין /d/ ל-/edit)
  sheetId: "1sHTzTT1_PlZjV0nMjFVBsPmQz4xquJM7jXxdoskNq0k",

  // המזהה של היומן בגוגל (נראה בערך כך: abc123...@group.calendar.google.com)
  calendarId: "c_f352eb49b5b1211c2013d898cf2bf091f6e0f5e99192028e6176fbc97d1b1098@group.calendar.google.com",

  // מפתח API של גוגל (לא חובה). בלעדיו כרטיסיית "אירועים קרובים"
  // מוצגת בתצוגת הרשימה של גוגל במקום ברשימה המעוצבת שלנו.
  apiKey: "",

  timezone: "Asia/Jerusalem",

  // קיר הכיתה (Firebase). מדביקים כאן את ההגדרות מ-Firebase, לפי שלב 6 במדריך.
  // הערכים האלה לא סודיים, ומותר שיהיו גלויים באתר.
  firebase: {
    apiKey: "AIzaSyA-WyHlSpr2_DPuAbirriON2FgVGjqYiQU",
    authDomain: "yoyo-class.firebaseapp.com",
    projectId: "yoyo-class",
    appId: "1:973933729885:web:8d8cd5347a74a2fc8055b4",
  },

  // מי יכול למחוק כל הודעה בקיר (מורה/מנהלי האתר). אותם מיילים צריכים להופיע גם בקובץ firestore.rules
  admins: ["shomron.avi@gmail.com", "yoyo@datalab.cs.biu.ac.il"],

  // שמות הלשוניות בתוך ה-Google Sheet (צריכים להיות זהים בדיוק)
  sheets: {
    schedule: "מערכת שעות",
    announcements: "הודעות",
    links: "קישורים",
  },
};
