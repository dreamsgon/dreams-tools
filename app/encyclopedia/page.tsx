import WorkspaceApp from '@/components/encyclopedia/workspace-app';
import {getAppUser} from '@/lib/app-user';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function EncyclopediaPage(){if(!await getAppUser())redirect('/account');return <WorkspaceApp/>;}
