import { collection, addDoc, getDocs, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';

// In-memory cache of the user's memories
let memoryCache: string[] = [];

export async function loadMemories() {
  const user = auth.currentUser;
  if (!user) {
    memoryCache = [];
    return;
  }
  
  try {
    const q = query(
      collection(db, 'users', user.uid, 'memories'),
      orderBy('createdAt', 'asc')
    );
    const snapshot = await getDocs(q);
    memoryCache = snapshot.docs.map(doc => doc.data().fact);
  } catch (error) {
    console.error("Error loading memories:", error);
    memoryCache = [];
  }
}

export async function addMemory(fact: string) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    // Optimistically update cache
    memoryCache.push(fact);
    
    await addDoc(collection(db, 'users', user.uid, 'memories'), {
      fact,
      uid: user.uid,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error adding memory:", error);
    // Revert cache on error
    memoryCache = memoryCache.filter(m => m !== fact);
  }
}

export function getMemoryContext(): string {
  if (memoryCache.length === 0) return "";
  return `\n\nHere is what you permanently remember about the user from past conversations:\n- ${memoryCache.join('\n- ')}\nUse this information to personalize your responses.`;
}
