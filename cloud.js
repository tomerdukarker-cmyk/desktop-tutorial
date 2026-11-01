// חיבור ל-Firebase: כניסה עם Google ושמירת המשימות בענן (Firestore)
// הגישה ללוח נקבעת בכללי האבטחה של Firestore (בקונסולה של Firebase), לא בקוד הזה.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut as firebaseSignOut
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    doc,
    onSnapshot,
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

// פרטי הפרויקט - לא סודיים, מיועדים להופיע בקוד של האתר
const firebaseConfig = {
    apiKey: 'AIzaSyAKJ2YxeBEOEiUw7ReoY0m8cTv0fUSr7Lw',
    authDomain: 'desktop-tutorial-c8c95.firebaseapp.com',
    projectId: 'desktop-tutorial-c8c95',
    storageBucket: 'desktop-tutorial-c8c95.firebasestorage.app',
    messagingSenderId: '648757604404',
    appId: '1:648757604404:web:58f2ff31ba2d5bf61e1a61'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// שמירה מקומית: האתר ממשיך לעבוד גם בלי אינטרנט ומסתנכרן כשהחיבור חוזר
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// לוח משותף אחד לשני המשתמשים
const tasksCollection = collection(db, 'boards', 'shared', 'tasks');

let unsubscribeTasks = null;

// מאזין לכניסה/יציאה ולשינויים במשימות. onTasks נקרא בכל שינוי - גם של המשתמש השני
// sync: { fromCache } = הנתונים מהמכשיר ולא מהשרת, { pending } = יש שינויים שעוד לא הגיעו לענן
export function startCloud({ onUser, onTasks, onError }) {
    onAuthStateChanged(auth, (user) => {
        if (unsubscribeTasks) {
            unsubscribeTasks();
            unsubscribeTasks = null;
        }
        onUser(user);
        if (!user) return;

        unsubscribeTasks = onSnapshot(
            tasksCollection,
            { includeMetadataChanges: true },
            (snapshot) => onTasks(
                snapshot.docs.map((d) => ({ id: d.id, ...d.data(), pending: d.metadata.hasPendingWrites })),
                { fromCache: snapshot.metadata.fromCache, pending: snapshot.metadata.hasPendingWrites }
            ),
            (error) => onError(error)
        );
    });
}

// תמיד מציג בחירת חשבון, כדי שאפשר יהיה להחליף לחשבון המורשה
export function signIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return signInWithPopup(auth, provider);
}

export function signOut() {
    return firebaseSignOut(auth);
}

// הפונקציות למטה לא מחכות לשרת: Firestore מעדכן את המסך מיד ומסנכרן ברקע
function stripId({ id, ...data }) {
    return data;
}

export function saveTask(task) {
    return setDoc(doc(tasksCollection, task.id), stripId(task));
}

export function updateTask(id, changes) {
    return updateDoc(doc(tasksCollection, id), { ...changes, updatedAt: Date.now() });
}

export function deleteTask(id) {
    return deleteDoc(doc(tasksCollection, id));
}

export function deleteTasks(ids) {
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(doc(tasksCollection, id)));
    return batch.commit();
}

// העברת משימות ישנות מהדפדפן ללוח המשותף (אותו מזהה = בלי כפילויות גם אם רץ פעמיים)
export function uploadTasks(tasks) {
    const batch = writeBatch(db);
    tasks.forEach((task) => batch.set(doc(tasksCollection, task.id), stripId(task)));
    return batch.commit();
}
