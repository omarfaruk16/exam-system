import { Loader2, Trash2, Upload, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useSession, useUpdateProfile } from '@/lib/session';
import { initials } from '@/lib/user';

const MAX_DIM = 256; // avatars are shown at ≤ 40px; 256 keeps them crisp on retina

/** Resize an image file to a square-ish JPEG data URL, capped at MAX_DIM on the long edge. */
async function fileToAvatarDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That file is not a valid image'));
    image.src = dataUrl;
  });
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function ProfilePage() {
  const { data: user } = useSession();
  const updateProfile = useUpdateProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  // undefined = unchanged, null = remove, string = new image
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setEmail(user.email ?? '');
      setAvatar(undefined);
    }
  }, [user]);

  if (!user) return null;

  const previewSrc = avatar === undefined ? user.avatarUrl : avatar;

  const dirty =
    displayName.trim() !== user.displayName ||
    email.trim() !== (user.email ?? '') ||
    avatar !== undefined;

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    setProcessing(true);
    try {
      setAvatar(await fileToAvatarDataUrl(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not process that image');
    } finally {
      setProcessing(false);
    }
  }

  async function onSave() {
    const patch: { displayName?: string; email?: string; avatarUrl?: string | null } = {};
    if (displayName.trim() !== user!.displayName) patch.displayName = displayName.trim();
    if (email.trim() !== (user!.email ?? '')) patch.email = email.trim();
    if (avatar !== undefined) patch.avatarUrl = avatar;
    try {
      await updateProfile.mutateAsync(patch);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save your profile');
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
          <CardDescription>Update your name, email, and profile picture.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              {previewSrc && <AvatarImage src={previewSrc} alt={user.displayName} />}
              <AvatarFallback className="text-lg">{initials(user.displayName)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={processing}
              >
                {processing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {previewSrc ? 'Change photo' : 'Upload photo'}
              </Button>
              {previewSrc && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setAvatar(null)}
                  disabled={processing}
                >
                  <Trash2 className="size-4" /> Remove
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Full name</Label>
            <div className="relative">
              <UserRound className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="pl-9"
                autoComplete="name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@ru.ac.bd"
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={onSave} disabled={!dirty || processing || updateProfile.isPending}>
              {updateProfile.isPending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
