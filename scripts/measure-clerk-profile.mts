// Read-only diagnosis of the configured owner's profile. Never prints identity or credentials.
import { createClerkClient } from "@clerk/nextjs/server";
import { readAccess } from "../src/lib/access-store";
const access = await readAccess();
const owner = access?.accounts.find(account => account.username === "admin");
if (!owner?.clerkUserId || !process.env.CLERK_SECRET_KEY) throw new Error("Falta la configuración del propietario para esta medición.");
const client = createClerkClient({secretKey:process.env.CLERK_SECRET_KEY,...(process.env.CLERK_API_URL?{apiUrl:process.env.CLERK_API_URL}:{})});
const samples=[];
for(let i=0;i<5;i++){
  const start=performance.now();
  try{
    const user=await client.users.getUser(owner.clerkUserId);
    samples.push({ms:performance.now()-start,ok:user.id===owner.clerkUserId});
  }catch(error){samples.push({ms:performance.now()-start,ok:false,status:(error as {status?:number}).status??null});break}
}
console.log(JSON.stringify({provider:"Clerk",operation:"read own profile",samples}));
