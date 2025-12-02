// ============================================================================
// Script pour créer des utilisateurs de test
// Usage: node scripts/seed-test-users.js
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement depuis .env.local
function loadEnv() {
    try {
        const envPath = join(__dirname, '..', '.env.local');
        const envContent = readFileSync(envPath, 'utf-8');
        const env = {};
        
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^#=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^["']|["']$/g, '');
                env[key] = value;
            }
        });
        
        return env;
    } catch (err) {
        console.error('❌ Erreur lors du chargement de .env.local:', err.message);
        console.log('💡 Assurez-vous que le fichier .env.local existe avec:');
        console.log('   - VITE_SUPABASE_URL');
        console.log('   - VITE_SUPABASE_ANON_KEY');
        console.log('   - SUPABASE_SERVICE_ROLE_KEY (optionnel, pour créer les utilisateurs)');
        process.exit(1);
    }
}

const env = loadEnv();

const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    console.error('❌ VITE_SUPABASE_URL manquant dans .env.local');
    process.exit(1);
}

if (!supabaseServiceKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local');
    console.log('💡 Pour obtenir la clé de service:');
    console.log('   1. Allez dans Supabase Dashboard > Settings > API');
    console.log('   2. Copiez la "service_role" key (⚠️ gardez-la secrète!)');
    console.log('   3. Ajoutez-la dans .env.local: SUPABASE_SERVICE_ROLE_KEY=votre_cle');
    process.exit(1);
}

// Créer le client Supabase avec la clé de service
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Configuration des utilisateurs de test
const TEST_USERS = [
    {
        email: 'orgadmin@test.com',
        password: 'Test123!',
        fullName: 'Org Admin Test',
        appRole: 'org_admin',
        businessRole: 'provider',
        orgMemberRole: 'admin'
    },
    {
        email: 'orgadmin2@test.com',
        password: 'Test123!',
        fullName: 'Org Admin 2 Test',
        appRole: 'org_admin',
        businessRole: 'provider',
        orgMemberRole: 'admin'
    },
    {
        email: 'member1@test.com',
        password: 'Test123!',
        fullName: 'Member 1 Test',
        appRole: 'user',
        businessRole: 'client',
        orgMemberRole: 'member'
    },
    {
        email: 'member2@test.com',
        password: 'Test123!',
        fullName: 'Member 2 Test',
        appRole: 'user',
        businessRole: 'provider',
        orgMemberRole: 'member'
    },
    {
        email: 'member3@test.com',
        password: 'Test123!',
        fullName: 'Member 3 Test',
        appRole: 'user',
        businessRole: 'client',
        orgMemberRole: null // Pas d'organisation
    }
];

async function getOrCreateOrganization() {
    // Récupérer la première organisation disponible
    const { data: orgs, error } = await supabase
        .from('organizations')
        .select('id, name')
        .limit(1);

    if (error) {
        console.error('❌ Erreur lors de la récupération de l\'organisation:', error.message);
        return null;
    }

    if (orgs && orgs.length > 0) {
        console.log(`✅ Organisation trouvée: ${orgs[0].name} (${orgs[0].id})`);
        return orgs[0].id;
    }

    console.log('⚠️  Aucune organisation trouvée. Création d\'une organisation de test...');
    
    // Créer une organisation de test
    const { data: newOrg, error: createError } = await supabase
        .from('organizations')
        .insert({
            name: 'Organisation de Test',
            plan: 'free',
            credits_balance: 100
        })
        .select()
        .single();

    if (createError) {
        console.error('❌ Erreur lors de la création de l\'organisation:', createError.message);
        return null;
    }

    console.log(`✅ Organisation créée: ${newOrg.name} (${newOrg.id})`);
    return newOrg.id;
}

async function createTestUser(userConfig, orgId) {
    const { email, password, fullName, appRole, businessRole, orgMemberRole } = userConfig;

    try {
        // 1. Vérifier si l'utilisateur existe déjà
        const { data: existingUser } = await supabase.auth.admin.getUserByEmail(email);
        
        if (existingUser?.user) {
            console.log(`⚠️  L'utilisateur ${email} existe déjà. Mise à jour...`);
            
            // Mettre à jour le profil
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: existingUser.user.id,
                    email,
                    full_name: fullName,
                    app_role: appRole,
                    business_role: businessRole,
                    org_id: orgMemberRole ? orgId : null
                }, {
                    onConflict: 'id'
                });

            if (profileError) {
                console.error(`   ❌ Erreur profil: ${profileError.message}`);
            } else {
                console.log(`   ✅ Profil mis à jour`);
            }

            // Mettre à jour le membre de l'organisation si nécessaire
            if (orgMemberRole && orgId) {
                const { error: memberError } = await supabase
                    .from('organization_members')
                    .upsert({
                        org_id: orgId,
                        user_id: existingUser.user.id,
                        role: orgMemberRole,
                        status: 'active'
                    }, {
                        onConflict: 'org_id,user_id'
                    });

                if (memberError) {
                    console.error(`   ❌ Erreur membre: ${memberError.message}`);
                } else {
                    console.log(`   ✅ Membre mis à jour`);
                }
            }

            return { success: true, userId: existingUser.user.id, created: false };
        }

        // 2. Créer l'utilisateur dans auth.users
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName
            }
        });

        if (authError) {
            throw new Error(`Erreur auth: ${authError.message}`);
        }

        const userId = authData.user.id;
        console.log(`   ✅ Utilisateur créé: ${userId}`);

        // 3. Créer le profil
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: userId,
                email,
                full_name: fullName,
                app_role: appRole,
                business_role: businessRole,
                org_id: orgMemberRole ? orgId : null
            });

        if (profileError) {
            console.error(`   ❌ Erreur profil: ${profileError.message}`);
        } else {
            console.log(`   ✅ Profil créé`);
        }

        // 4. Ajouter comme membre de l'organisation si nécessaire
        if (orgMemberRole && orgId) {
            const { error: memberError } = await supabase
                .from('organization_members')
                .insert({
                    org_id: orgId,
                    user_id: userId,
                    role: orgMemberRole,
                    status: 'active',
                    invited_by: userId
                });

            if (memberError) {
                console.error(`   ❌ Erreur membre: ${memberError.message}`);
            } else {
                console.log(`   ✅ Membre ajouté (${orgMemberRole})`);
            }
        }

        return { success: true, userId, created: true };
    } catch (err) {
        console.error(`   ❌ Erreur: ${err.message}`);
        return { success: false, error: err.message };
    }
}

async function main() {
    console.log('🚀 Démarrage de la création des utilisateurs de test...\n');

    // Récupérer ou créer l'organisation
    const orgId = await getOrCreateOrganization();
    if (!orgId) {
        console.error('❌ Impossible de continuer sans organisation');
        process.exit(1);
    }

    console.log('\n📝 Création des utilisateurs...\n');

    const results = [];
    for (const userConfig of TEST_USERS) {
        console.log(`👤 Création de ${userConfig.email}...`);
        const result = await createTestUser(userConfig, orgId);
        results.push({ email: userConfig.email, ...result });
        console.log('');
    }

    // Résumé
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 RÉSUMÉ');
    console.log('═══════════════════════════════════════════════════════\n');

    const successCount = results.filter(r => r.success).length;
    const createdCount = results.filter(r => r.success && r.created).length;
    const updatedCount = results.filter(r => r.success && !r.created).length;

    console.log(`✅ Succès: ${successCount}/${TEST_USERS.length}`);
    console.log(`   - Créés: ${createdCount}`);
    console.log(`   - Mis à jour: ${updatedCount}\n`);

    console.log('📋 Comptes créés (mot de passe: Test123!):');
    TEST_USERS.forEach(user => {
        const result = results.find(r => r.email === user.email);
        const status = result?.success ? '✅' : '❌';
        console.log(`   ${status} ${user.email} (${user.appRole})`);
    });

    console.log('\n💡 Vous pouvez maintenant utiliser le Profile Switcher dans /admin');
    console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
});



