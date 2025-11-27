-- Create meetings table
create table if not exists public.meetings (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  audio_url text,
  summary_markdown text,
  project_id uuid, -- Optional link to a project
  metadata jsonb default '{}'::jsonb,
  user_id uuid default auth.uid()
);

-- Enable RLS
alter table public.meetings enable row level security;

-- Policies for meetings
create policy "Users can view their own meetings"
  on public.meetings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own meetings"
  on public.meetings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own meetings"
  on public.meetings for update
  using (auth.uid() = user_id);

create policy "Users can delete their own meetings"
  on public.meetings for delete
  using (auth.uid() = user_id);

-- Storage Bucket for Audio
insert into storage.buckets (id, name, public)
values ('project-recordings', 'project-recordings', true)
on conflict (id) do nothing;

-- Storage Policies
create policy "Authenticated users can upload recordings"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'project-recordings' );

create policy "Authenticated users can view recordings"
  on storage.objects for select
  to authenticated
  using ( bucket_id = 'project-recordings' );
