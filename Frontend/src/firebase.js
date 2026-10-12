
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCjr-6pqPUTqfXNoXFR49mKUPtBL0bSBC0",
  authDomain: "cloud-based-blood-connect.firebaseapp.com",
  projectId: "cloud-based-blood-connect",
  storageBucket: "cloud-based-blood-connect.firebasestorage.app",
  messagingSenderId: "448792546089",
  appId: "1:448792546089:web:f684a63a22e7ffd7268538",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);