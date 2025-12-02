// ============================================================================
// BRIQUE 6 : Edge Function - invite-user
// Invite un utilisateur à rejoindre une organisation
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteRequest {
    email: string;
    role: 'admin' | 'member';
    org_id: string;
}

serve(async (req) => {
    // Gestion CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        console.log("🚀 INVITE-USER: Début du traitement");

        // ============================================
        // 1. INITIALISATION
        // ============================================
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        if (!supabaseServiceKey) {
            throw new Error('Configuration serveur manquante');
        }

        // Client Admin (pour les opérations privilégiées)
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            }
        });

        // ============================================
        // 2. AUTHENTIFICATION DE L'APPELANT
        // ============================================
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new Error('Token d\'authentification manquant');
        }

        const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(
            authHeader.replace('Bearer ', '')
        );

        if (authError || !caller) {
            throw new Error('Authentification invalide');
        }

        console.log(`👤 Appelant: ${caller.email} (${caller.id})`);

        // ============================================
        // 3. PARSING DE LA REQUÊTE
        // ============================================
        const body: InviteRequest = await req.json();
        const { email, role, org_id } = body;

        // Validation des champs
        if (!email || !email.includes('@')) {
            throw new Error('Email invalide');
        }

        if (!['admin', 'member'].includes(role)) {
            throw new Error('Rôle invalide. Valeurs acceptées: admin, member');
        }

        if (!org_id) {
            throw new Error('ID d\'organisation manquant');
        }

        console.log(`📧 Invitation: ${email} -> ${role} dans org ${org_id}`);

        // ============================================
        // 4. VÉRIFICATION DES DROITS DE L'APPELANT
        // ============================================
        const { data: callerMembership, error: membershipError } = await supabaseAdmin
            .from('organization_members')
            .select('role, status')
            .eq('org_id', org_id)
            .eq('user_id', caller.id)
            .eq('status', 'active')
            .single();

        if (membershipError || !callerMembership) {
            throw new Error('Vous n\'êtes pas membre de cette organisation');
        }

        if (!['owner', 'admin'].includes(callerMembership.role)) {
            throw new Error('Seuls les administrateurs peuvent inviter des membres');
        }

        // Un admin ne peut pas inviter un autre admin (seul le owner peut)
        if (callerMembership.role === 'admin' && role === 'admin') {
            throw new Error('Seul le propriétaire peut nommer des administrateurs');
        }

        console.log(`✅ Droits validés: ${callerMembership.role}`);

        // ============================================
        // 5. VÉRIFICATION SI DÉJÀ MEMBRE/INVITÉ
        // ============================================
        // Vérifier par email si déjà invité
        const { data: existingInvite } = await supabaseAdmin
            .from('organization_members')
            .select('id, status')
            .eq('org_id', org_id)
            .eq('invited_email', email.toLowerCase())
            .single();

        if (existingInvite) {
            if (existingInvite.status === 'invited') {
                throw new Error('Cette personne a déjà été invitée');
            }
            throw new Error('Cette personne est déjà membre de l\'organisation');
        }

        // Vérifier si l'utilisateur existe déjà dans auth.users
        const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(
            u => u.email?.toLowerCase() === email.toLowerCase()
        );

        if (existingUser) {
            // Vérifier s'il n'est pas déjà membre par user_id
            const { data: existingMember } = await supabaseAdmin
                .from('organization_members')
                .select('id')
                .eq('org_id', org_id)
                .eq('user_id', existingUser.id)
                .single();

            if (existingMember) {
                throw new Error('Cet utilisateur est déjà membre de l\'organisation');
            }
        }

        // ============================================
        // 6. RÉCUPÉRATION DES INFOS DE L'ORGANISATION
        // ============================================
        const { data: organization, error: orgError } = await supabaseAdmin
            .from('organizations')
            .select('name')
            .eq('id', org_id)
            .single();

        if (orgError || !organization) {
            throw new Error('Organisation non trouvée');
        }

        // ============================================
        // 7. ENVOI DE L'INVITATION SUPABASE AUTH
        // ============================================
        let invitedUserId: string | null = null;
        let inviteLink: string | null = null;

        if (existingUser) {
            // L'utilisateur existe déjà, pas besoin d'envoyer un email d'invitation auth
            invitedUserId = existingUser.id;
            console.log(`👤 Utilisateur existant: ${invitedUserId}`);
        } else {
            // Nouvel utilisateur: envoyer une invitation
            console.log(`📤 Envoi invitation Supabase Auth...`);
            
            const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin
                .inviteUserByEmail(email, {
                    redirectTo: `${supabaseUrl.replace('.supabase.co', '.vercel.app')}/login?invited=true`,
                    data: {
                        invited_to_org: org_id,
                        invited_role: role,
                        invited_by: caller.id,
                    }
                });

            if (inviteError) {
                console.error('Erreur invitation:', inviteError);
                throw new Error(`Impossible d'envoyer l'invitation: ${inviteError.message}`);
            }

            invitedUserId = inviteData?.user?.id || null;
            console.log(`✅ Invitation envoyée, user_id: ${invitedUserId}`);
        }

        // ============================================
        // 8. CRÉATION DE L'ENTRÉE ORGANIZATION_MEMBERS
        // ============================================
        const memberData = {
            org_id: org_id,
            user_id: existingUser ? existingUser.id : null,
            role: role,
            status: existingUser ? 'active' : 'invited',
            invited_email: existingUser ? null : email.toLowerCase(),
            invited_by: caller.id,
            invited_at: new Date().toISOString(),
        };

        const { data: newMember, error: insertError } = await supabaseAdmin
            .from('organization_members')
            .insert(memberData)
            .select()
            .single();

        if (insertError) {
            console.error('Erreur insertion membre:', insertError);
            throw new Error(`Impossible de créer l'invitation: ${insertError.message}`);
        }

        // Si l'utilisateur existe déjà, mettre à jour son profil
        if (existingUser) {
            await supabaseAdmin
                .from('profiles')
                .update({ org_id: org_id })
                .eq('id', existingUser.id);
        }

        console.log(`✅ Membre créé: ${newMember.id}`);

        // ============================================
        // 9. RÉPONSE SUCCÈS
        // ============================================
        return new Response(
            JSON.stringify({
                success: true,
                message: existingUser 
                    ? `${email} a été ajouté à l'organisation`
                    : `Invitation envoyée à ${email}`,
                member: {
                    id: newMember.id,
                    email: email,
                    role: role,
                    status: newMember.status,
                },
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error: any) {
        console.error('❌ Erreur invite-user:', error);

        return new Response(
            JSON.stringify({
                success: false,
                error: error.message || 'Une erreur est survenue',
            }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});







