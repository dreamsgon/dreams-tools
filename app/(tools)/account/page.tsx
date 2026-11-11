import AccountForm from "@/components/account-form";
import {getAppUser} from "@/lib/app-user";
export const dynamic="force-dynamic";
export const metadata={title:"Account | RPG Tools"};
export default async function AccountPage(){const user=await getAppUser();return <AccountForm user={user?{name:user.displayName,provider:user.provider}:null}/>;}
