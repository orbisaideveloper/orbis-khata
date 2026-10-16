export type AccountProfile = {
  name: string; address: string | null; alternatePhone: string | null;
  dateOfBirth: string | null; gender: 'male' | 'female' | 'other' | 'prefer-not-to-say' | null;
}
export type ProfileResult = {
  customer: { orbisIdentityId: string; displayId: string }; profile: AccountProfile;
  contact: { email: string | null; phone: string | null };
}
type SessionReader = () => Promise<{data:{session:{access_token:string;user:{id:string}}|null};error:unknown}>
const identity = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const display = /^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/u
const nullableText = (value:unknown, limit:number): value is string|null => value === null || (typeof value === 'string' && value.length <= limit)
function object(value:unknown): value is Record<string,unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }
export function parseAccountProfile(value:unknown):ProfileResult {
  if (!object(value) || value.version !== 'orbis.customer.profile.v1' || !object(value.customer) ||
      !object(value.profile) || !object(value.contact)) throw new Error('PROFILE_INVALID')
  const {customer,profile,contact}=value
  if (typeof customer.orbisIdentityId !== 'string' || !identity.test(customer.orbisIdentityId) ||
      typeof customer.displayId !== 'string' || !display.test(customer.displayId) ||
      typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 120 ||
      !nullableText(profile.address,1000) || !nullableText(profile.alternatePhone,40) ||
      !nullableText(profile.dateOfBirth,10) || !nullableText(contact.email,254) || !nullableText(contact.phone,40) ||
      ![null,'male','female','other','prefer-not-to-say'].includes(profile.gender as null|string)) throw new Error('PROFILE_INVALID')
  return {customer:{orbisIdentityId:customer.orbisIdentityId,displayId:customer.displayId},
    profile:{name:profile.name,address:profile.address,alternatePhone:profile.alternatePhone,dateOfBirth:profile.dateOfBirth,gender:profile.gender as AccountProfile['gender']},
    contact:{email:contact.email,phone:contact.phone}}
}
export async function requestAccountProfile(readSession:SessionReader, userId:string, signal:AbortSignal, patch?:AccountProfile):Promise<ProfileResult> {
  const initial=await readSession()
  if (signal.aborted || initial.error || initial.data.session?.user.id !== userId) throw new Error('PROFILE_SESSION_CHANGED')
  const base=import.meta.env.VITE_ORBIS_CUSTOMER_API_URL || 'https://orbis-admin-staging.onrender.com'
  const endpoint=new URL(base)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('PROFILE_ENDPOINT_INVALID')
  const response=await fetch(endpoint.origin+'/api/v1/customer/profile',{
    method:patch?'POST':'GET',headers:{authorization:`Bearer ${initial.data.session.access_token}`,'content-type':'application/json'},
    body:patch?JSON.stringify(patch):undefined,signal,credentials:'omit',cache:'no-store',redirect:'error',
  })
  if(!response.ok)throw new Error('PROFILE_UNAVAILABLE')
  const raw=await response.text()
  if(raw.length>65536)throw new Error('PROFILE_INVALID')
  return parseAccountProfile(JSON.parse(raw))
}
