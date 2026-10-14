import React, { useState } from 'react';
import { UserAccount, Role } from '../types';
import {
  Users,
  UserPlus,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building,
  MapPin,
  Lock,
  Search,
  LogIn,
  Trash2,
  Edit2,
  BadgeCheck,
} from 'lucide-react';

interface UserManagementPanelProps {
  users: UserAccount[];
  currentUser: UserAccount;
  isAdmin: boolean;
  onSwitchUser: (username: string, role: Role) => void;
  onCreateUser: (user: Partial<UserAccount> & { password?: string }) => Promise<void>;
  onUpdateUser: (username: string, updates: Partial<UserAccount>) => Promise<void>;
  onDeleteUser: (username: string) => Promise<void>;
}

export const UserManagementPanel: React.FC<UserManagementPanelProps> = ({
  users,
  currentUser,
  isAdmin,
  onSwitchUser,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | Role>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  // Formulaire de création / édition
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    role: 'operateur' as Role,
    wilayaScope: 'Région Centre & Est (Alger, Constantine)',
    department: 'Centre National de Conduite (CNC)',
    badgeNumber: '',
    electricalClearance: 'HTB-400kV / Chargé de Conduite CNC',
    password: '',
    status: 'ACTIVE' as 'ACTIVE' | 'ON_DUTY' | 'SUSPENDED',
  });

  const filteredUsers = users.filter((u) => {
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    const term = searchTerm.toLowerCase();
    const matchText =
      u.fullName.toLowerCase().includes(term) ||
      u.username.toLowerCase().includes(term) ||
      u.wilayaScope.toLowerCase().includes(term) ||
      (u.badgeNumber && u.badgeNumber.toLowerCase().includes(term));
    return matchRole && matchText;
  });

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      fullName: '',
      role: 'operateur',
      wilayaScope: 'Région Ouest (Oran, Arzew)',
      department: 'Centre Régional de Conduite Ouest (CRC)',
      badgeNumber: `DZ-AGT-${Math.floor(1000 + Math.random() * 8999)}`,
      electricalClearance: 'HTB-220kV / Dispatcher Régional',
      password: '',
      status: 'ACTIVE',
    });
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (u: UserAccount) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      wilayaScope: u.wilayaScope,
      department: u.department,
      badgeNumber: u.badgeNumber || '',
      electricalClearance: u.electricalClearance || '',
      password: '',
      status: u.status || 'ACTIVE',
    });
    setIsCreateModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      await onUpdateUser(editingUser.username, {
        fullName: formData.fullName,
        role: formData.role,
        wilayaScope: formData.wilayaScope,
        department: formData.department,
        badgeNumber: formData.badgeNumber,
        electricalClearance: formData.electricalClearance,
        status: formData.status,
      });
    } else {
      await onCreateUser(formData);
    }
    setIsCreateModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* BANNIÈRE EXPLICITE DE MODE D'AFFICHAGE */}
      <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-400 flex items-center justify-center text-indigo-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 uppercase font-semibold">
                  Mode Annuaire &amp; Habilitations
                </span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Loi Algérienne n° 18-07
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">
                Gestion des Utilisateurs, Rôles RBAC &amp; Habilitations SCADA
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Contrôle d’accès aux commandes critiques (IEC-61850 / Modbus-TCP), affectation géographique par Wilaya et traçabilité des profils.
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-md"
            >
              <UserPlus className="w-4 h-4" />
              Habiliter un Nouvel Agent
            </button>
          )}
        </div>
      </div>

      {/* STATISTIQUES SOUVERAINES DU PERSONNEL TECHNIQUE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-400">Agents &amp; Superviseurs Enregistrés</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {users.length}
            </span>
            <span className="text-indigo-400 font-mono text-[11px]">Annuaire National DZ</span>
          </div>
          <div className="mt-2 text-slate-400 text-[11px]">
            Hébergement souverain sur serveurs locaux SONELGAZ
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-400">Ingénieurs Habilités Dispatching CNC</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-sky-400 tabular-nums">
              {users.filter((u) => u.role === 'operateur').length}
            </span>
            <span className="text-emerald-400 font-mono text-[11px]">Habilitation HTB-400kV</span>
          </div>
          <div className="mt-2 text-slate-400 text-[11px]">
            Autorisés à exécuter des ordres de délestage &amp; reroutage
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-400">Auditeurs Légalité &amp; Inspection (18-07)</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
              {users.filter((u) => u.role === 'lecteur').length}
            </span>
            <span className="text-amber-300 font-mono text-[11px]">Lecture Seule Stricte</span>
          </div>
          <div className="mt-2 text-slate-400 text-[11px]">
            Vérification des preuves RSA-4096 et intégrité SHA-256
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-slate-400">Sessions Actives &amp; Astreinte</div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              {users.filter((u) => u.status === 'ON_DUTY' || u.status === 'ACTIVE').length}
            </span>
            <span className="text-slate-300 font-mono text-[11px]">Postes 24h/24</span>
          </div>
          <div className="mt-2 text-slate-400 text-[11px]">
            Chiffrement JWT HMAC-SHA256 valide (Session 8h)
          </div>
        </div>
      </div>

      {/* BARRE DE RECHERCHE ET FILTRES */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 text-xs">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <label htmlFor="user-search-input" className="sr-only">
              Rechercher un agent ou opérateur SONELGAZ
            </label>
            <input
              id="user-search-input"
              name="user_search"
              type="text"
              placeholder="Rechercher par nom, matricule agent, wilaya..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Filtrer par Rôle :</span>
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-700 rounded-lg">
            {(['ALL', 'admin', 'operateur', 'lecteur'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  roleFilter === r
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {r === 'ALL'
                  ? 'Tous'
                  : r === 'admin'
                  ? 'Admin'
                  : r === 'operateur'
                  ? 'Opérateur'
                  : 'Lecteur'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TABLEAU DES UTILISATEURS */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-indigo-400" />
            Annuaire des Agents Habilités SONELGAZ ({filteredUsers.length} affichés)
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Session active en cours : <strong className="text-sky-300">{currentUser.fullName}</strong> ({currentUser.role})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <th className="py-3 px-4 font-medium">Agent &amp; Identifiant</th>
                <th className="py-3 px-4 font-medium">Matricule &amp; Contact</th>
                <th className="py-3 px-4 font-medium">Rôle RBAC</th>
                <th className="py-3 px-4 font-medium">Périmètre / Wilayas</th>
                <th className="py-3 px-4 font-medium">Habilitation Technique</th>
                <th className="py-3 px-4 font-medium">Statut</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredUsers.map((u) => {
                const isCurrent = u.username === currentUser.username;
                return (
                  <tr
                    key={u.id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isCurrent ? 'bg-indigo-950/20' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            u.role === 'admin'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : u.role === 'operateur'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {u.fullName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-white flex items-center gap-1.5">
                            {u.fullName}
                            {isCurrent && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-1.5 py-0.2">
                                Vous
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            @{u.username} · ID: {u.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      <div>{u.badgeNumber || 'DZ-AGT-••••'}</div>
                      <div className="text-[11px] text-slate-400">{u.phoneEncrypted || '+213 ••••••••'}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded text-[11px] font-semibold border ${
                          u.role === 'admin'
                            ? 'bg-rose-500/15 border-rose-400 text-rose-300'
                            : u.role === 'operateur'
                            ? 'bg-sky-500/15 border-sky-400 text-sky-300'
                            : 'bg-emerald-500/15 border-emerald-400 text-emerald-300'
                        }`}
                      >
                        {u.role === 'admin'
                          ? 'Administrateur'
                          : u.role === 'operateur'
                          ? 'Opérateur SCADA'
                          : 'Lecteur / Audit'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-slate-200 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-sky-400 shrink-0" />
                        {u.wilayaScope}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building className="w-3 h-3 text-slate-400 shrink-0" />
                        {u.department}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-300">
                      {u.electricalClearance || 'H1V / Conduite'}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                          u.status === 'ON_DUTY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : u.status === 'SUSPENDED'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.status === 'ON_DUTY'
                              ? 'bg-emerald-400 animate-pulse'
                              : u.status === 'SUSPENDED'
                              ? 'bg-red-400'
                              : 'bg-slate-400'
                          }`}
                        />
                        {u.status === 'ON_DUTY'
                          ? 'En astreinte'
                          : u.status === 'SUSPENDED'
                          ? 'Suspendu'
                          : 'Actif'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!isCurrent && (
                          <button
                            onClick={() => onSwitchUser(u.username, u.role)}
                            title="Prendre cette session utilisateur"
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <LogIn className="w-3 h-3" />
                            Session
                          </button>
                        )}
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleOpenEditModal(u)}
                              title="Modifier les habilitations"
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {u.username !== 'admin' && (
                              <button
                                onClick={() => onDeleteUser(u.username)}
                                title="Révoquer cet agent"
                                className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 rounded transition-colors cursor-pointer border border-rose-800/40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MATRICE DES PERMISSIONS RBAC & LOI 18-07 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-400" />
            Matrice des Droits et Habilitations par Rôle (RBAC Strict)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Conformité à la Loi Algérienne n° 18-07 : Séparation des pouvoirs entre Conduite Opérationnelle et Contrôle Légal.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <th className="py-2.5 px-4 font-medium">Fonctionnalité &amp; Action SCADA</th>
                <th className="py-2.5 px-4 font-medium text-center">Admin (Dr. Besma)</th>
                <th className="py-2.5 px-4 font-medium text-center">Opérateur (CNC Dispatching)</th>
                <th className="py-2.5 px-4 font-medium text-center">Lecteur (Inspection 18-07)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {[
                {
                  label: 'Visualisation de la Topologie SCADA & Courbes 24h',
                  admin: true,
                  op: true,
                  audit: true,
                },
                {
                  label: 'Exécution d’Ordres SCADA (Reroutage IEC-61850 / Modbus-TCP)',
                  admin: true,
                  op: true,
                  audit: false,
                },
                {
                  label: 'Simulation & Injection de Télémétrie MQTT/Kafka',
                  admin: true,
                  op: true,
                  audit: false,
                },
                {
                  label: 'Déclenchement d’Inspections de Fraude AMI',
                  admin: true,
                  op: true,
                  audit: false,
                },
                {
                  label: 'Acquittement des Alertes FCM et SMS',
                  admin: true,
                  op: true,
                  audit: false,
                },
                {
                  label: 'Modification Dynamique des Seuils d’Alerte (ISA-18.2)',
                  admin: true,
                  op: false,
                  audit: false,
                },
                {
                  label: 'Configuration de la Politique d’Escalade SMS (Délais, Numéros)',
                  admin: true,
                  op: false,
                  audit: false,
                },
                {
                  label: 'Export d’Audit Signé RSA-4096 & Horodatage RFC 3161',
                  admin: true,
                  op: false,
                  audit: true,
                },
                {
                  label: 'Gestion des Comptes Agents & Habilitations Techniques',
                  admin: true,
                  op: false,
                  audit: false,
                },
              ].map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-4 text-slate-200">{row.label}</td>
                  <td className="py-2.5 px-4 text-center">
                    {row.admin ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                    ) : (
                      <XCircle className="w-4 h-4 text-slate-600 mx-auto" />
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {row.op ? (
                      <CheckCircle2 className="w-4 h-4 text-sky-400 mx-auto" />
                    ) : (
                      <XCircle className="w-4 h-4 text-slate-600 mx-auto" />
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {row.audit ? (
                      <CheckCircle2 className="w-4 h-4 text-amber-400 mx-auto" />
                    ) : (
                      <XCircle className="w-4 h-4 text-slate-600 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL D'AJOUT / ÉDITION D'UN AGENT */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                {editingUser ? "Modifier l'Agent SONELGAZ" : "Habiliter un Nouvel Agent"}
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="usr-username-input" className="block text-slate-400 mb-1">
                    Identifiant Système (@username) *
                  </label>
                  <input
                    id="usr-username-input"
                    name="usr_username"
                    type="text"
                    autoComplete="username"
                    required
                    disabled={!!editingUser}
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono disabled:opacity-50"
                    placeholder="ex: dispatch_est"
                  />
                </div>

                <div>
                  <label htmlFor="usr-fullname-input" className="block text-slate-400 mb-1">
                    Nom &amp; Prénom de l’Agent *
                  </label>
                  <input
                    id="usr-fullname-input"
                    name="usr_fullname"
                    type="text"
                    autoComplete="name"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    placeholder="ex: Rachid Bensalem"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="usr-role-select" className="block text-slate-400 mb-1">
                    Rôle d’Accès RBAC *
                  </label>
                  <select
                    id="usr-role-select"
                    name="usr_role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="operateur">Opérateur (Conduite SCADA)</option>
                    <option value="lecteur">Lecteur (Audit &amp; Inspection)</option>
                    <option value="admin">Administrateur (Gestion Totale)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="usr-badge-input" className="block text-slate-400 mb-1">
                    Matricule Agent SONELGAZ *
                  </label>
                  <input
                    id="usr-badge-input"
                    name="usr_badge"
                    type="text"
                    required
                    value={formData.badgeNumber}
                    onChange={(e) => setFormData({ ...formData, badgeNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                    placeholder="ex: DZ-AGT-2503"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="usr-wilaya-input" className="block text-slate-400 mb-1">
                  Périmètre Territorial / Wilayas *
                </label>
                <input
                  id="usr-wilaya-input"
                  name="usr_wilaya"
                  type="text"
                  required
                  value={formData.wilayaScope}
                  onChange={(e) => setFormData({ ...formData, wilayaScope: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  placeholder="ex: Région Est (Constantine, Skikda, Sétif)"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="usr-dept-input" className="block text-slate-400 mb-1">
                    Département / Direction
                  </label>
                  <input
                    id="usr-dept-input"
                    name="usr_dept"
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    placeholder="ex: CRC Constantine"
                  />
                </div>

                <div>
                  <label htmlFor="usr-clearance-input" className="block text-slate-400 mb-1">
                    Habilitation Technique
                  </label>
                  <input
                    id="usr-clearance-input"
                    name="usr_clearance"
                    type="text"
                    value={formData.electricalClearance}
                    onChange={(e) => setFormData({ ...formData, electricalClearance: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                    placeholder="ex: HTB-220kV / Dispatching"
                  />
                </div>
              </div>

              {!editingUser && (
                <div>
                  <label htmlFor="usr-password-input" className="block text-slate-400 mb-1">
                    Mot de passe initial *
                  </label>
                  <input
                    id="usr-password-input"
                    name="usr_password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                    placeholder="••••••••••••"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg cursor-pointer transition-colors"
                >
                  {editingUser ? 'Enregistrer Modifications' : 'Habiliter Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
