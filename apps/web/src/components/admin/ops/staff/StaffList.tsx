'use client';

import type { AdminRole, AdminUserDto, StaffUpdateInput } from '@noors/shared';
import { Plus, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, adminFetch, useAdminData } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { useAdmin } from '../../AdminShell';
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Switch,
} from '../../ui';
import { formatDateTime } from '../format';

const STAFF_LIMITS =
  "Staff can pack and ship orders, handle returns and update stock. They can't change prices, products, coupons or settings, or give refunds.";
const OWNER_NOTE = 'Owners can do everything, including adding people and changing settings.';

const roleLabel = (role: AdminRole) => (role === 'OWNER' ? 'Owner' : 'Staff');

/** A readable 16-character password from the browser's secure random source. */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function StaffList() {
  const me = useAdmin();
  const isOwner = me.role === 'OWNER';
  const router = useRouter();
  const { data, error, reload } = useAdminData<{ items: AdminUserDto[] }>(
    isOwner ? '/staff' : null,
  );
  const [adding, setAdding] = useState(0);
  const [editing, setEditing] = useState<{ user: AdminUserDto; n: number } | null>(null);

  useEffect(() => {
    if (!isOwner) router.replace('/admin/orders');
  }, [isOwner, router]);

  if (!isOwner) return <Spinner label="Opening orders" />;

  return (
    <>
      <PageHeader
        title="Staff"
        description="Who can sign in to the dashboard."
        actions={
          <Button variant="primary" onClick={() => setAdding((n) => n + 1)}>
            <Plus className="size-4" aria-hidden /> Add person
          </Button>
        }
      />

      <ErrorNote error={error} />

      {!data ? (
        !error && <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="No one here yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-background">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Two-factor</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Account</th>
                <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Last sign-in</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'text-muted'}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">
                      {u.name}
                      {u.id === me.id && <span className="ml-1.5 text-xs text-muted">(you)</span>}
                    </p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={u.role === 'OWNER' ? 'green' : 'neutral'}>
                      {roleLabel(u.role)}
                    </Badge>
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    {u.twoFactor ? (
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck
                          className="size-4 text-emerald-700 dark:text-emerald-400"
                          aria-hidden
                        />
                        On
                      </span>
                    ) : (
                      <span className="text-muted">Off</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">
                    {u.isActive ? <Badge tone="green">Active</Badge> : <Badge>Switched off</Badge>}
                  </td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted lg:table-cell">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      size="sm"
                      onClick={() => setEditing((e) => ({ user: u, n: (e?.n ?? 0) + 1 }))}
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddPersonDialog
        key={`add-${adding}`}
        open={adding > 0}
        onClose={() => setAdding(0)}
        onSaved={reload}
      />
      {editing && (
        <EditPersonDialog
          key={`edit-${editing.n}`}
          user={editing.user}
          isMe={editing.user.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}

function RoleField({
  value,
  onChange,
  error,
}: {
  value: AdminRole;
  onChange: (role: AdminRole) => void;
  error?: string;
}) {
  return (
    <Field label="Role" error={error} hint={value === 'STAFF' ? STAFF_LIMITS : OWNER_NOTE}>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value as AdminRole)}>
          <option value="STAFF">Staff</option>
          <option value="OWNER">Owner</option>
        </Select>
      )}
    </Field>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint: string;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id) => (
        <div className="flex gap-2">
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={Boolean(error)}
            autoComplete="new-password"
            spellCheck={false}
            className="font-mono"
          />
          <Button onClick={() => onChange(generatePassword())}>Generate</Button>
        </div>
      )}
    </Field>
  );
}

function AddPersonDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('STAFF');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError>();
  const [tooShort, setTooShort] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (password.length < 10) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    setBusy(true);
    try {
      await adminFetch('/staff', { body: { name, email, role, password } });
      toast.success(`${name.trim()} can now sign in`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add person"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-person" variant="primary" busy={busy}>
            Add person
          </Button>
        </>
      }
    >
      <form id="add-person" onSubmit={onSubmit} className="space-y-4">
        {error && !error.issues.length && <ErrorNote error={error} />}
        <Field label="Name" error={error?.fieldError('name')}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(error?.fieldError('name'))}
              required
              maxLength={100}
              autoFocus
            />
          )}
        </Field>
        <Field label="Email" error={error?.fieldError('email')}>
          {(id) => (
            <Input
              id={id}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error?.fieldError('email'))}
              required
            />
          )}
        </Field>
        <RoleField value={role} onChange={setRole} error={error?.fieldError('role')} />
        <PasswordField
          label="Temporary password"
          value={password}
          onChange={setPassword}
          error={tooShort ? 'Use at least 10 characters' : error?.fieldError('password')}
          hint="At least 10 characters. Share it with them privately and ask them to change it from Your account."
        />
      </form>
    </Modal>
  );
}

function EditPersonDialog({
  user,
  isMe,
  onClose,
  onSaved,
}: {
  user: AdminUserDto;
  isMe: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<AdminRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [password, setPassword] = useState('');
  const [twoFactor, setTwoFactor] = useState(user.twoFactor);
  const [error, setError] = useState<ApiError>();
  const [tooShort, setTooShort] = useState(false);
  const [busy, setBusy] = useState<'save' | '2fa' | null>(null);

  const close = () => {
    setOpen(false);
    onClose();
  };

  async function patch(body: StaffUpdateInput) {
    return adminFetch<AdminUserDto>(`/staff/${user.id}`, { method: 'PATCH', body });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (password && password.length < 10) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    const body: StaffUpdateInput = {};
    if (name.trim() !== user.name) body.name = name;
    if (role !== user.role) body.role = role;
    if (isActive !== user.isActive) body.isActive = isActive;
    if (password) body.password = password;
    if (!Object.keys(body).length) {
      close();
      return;
    }
    setBusy('save');
    try {
      await patch(body);
      toast.success(`Saved changes for ${name.trim() || user.name}`);
      onSaved();
      close();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(null);
    }
  }

  async function resetTwoFactor() {
    setError(undefined);
    setBusy('2fa');
    try {
      await patch({ resetTwoFactor: true });
      setTwoFactor(false);
      toast.success(`Two-factor sign-in is off for ${user.name}`);
      onSaved();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Manage ${user.name}`}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" form="edit-person" variant="primary" busy={busy === 'save'}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-person" onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-muted">{user.email}</p>
        {error && !error.issues.length && <ErrorNote error={error} />}
        <Field label="Name" error={error?.fieldError('name')}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(error?.fieldError('name'))}
              maxLength={100}
            />
          )}
        </Field>
        <RoleField value={role} onChange={setRole} error={error?.fieldError('role')} />

        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex">
            <Switch
              checked={isActive}
              onChange={setIsActive}
              label="Account switched on"
              disabled={isMe}
            />
          </span>
          <div>
            <p className="text-sm font-medium">Account switched on</p>
            <p className="text-xs text-muted">
              {isMe
                ? 'You cannot switch off your own account.'
                : 'Switching it off signs them out and stops them signing in.'}
            </p>
          </div>
        </div>

        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          error={tooShort ? 'Use at least 10 characters' : error?.fieldError('password')}
          hint="Leave empty to keep their password. A new one signs them out everywhere."
        />

        {twoFactor && (
          <div className="rounded-lg border border-line p-3">
            <p className="text-sm font-medium">Two-factor sign-in is on</p>
            <p className="mt-0.5 text-xs text-muted">
              If they lost their phone, turn it off so they can sign in with just their password,
              then ask them to set it up again.
            </p>
            <Button
              size="sm"
              variant="danger"
              className="mt-2"
              busy={busy === '2fa'}
              onClick={resetTwoFactor}
            >
              Turn off two-factor
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
