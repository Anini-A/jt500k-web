// Small build-version marker so we can tell which build each page is running.
export default function VersionStamp({ page }: { page: string }) {
  return (
    <div className="stat-label" style={{ textTransform: 'none', letterSpacing: 0, textAlign: 'center', marginTop: 24, paddingBottom: 24 }}>
      {page} version <code>{(process.env.NEXT_PUBLIC_COMMIT_SHA || 'local').slice(0, 7)}</code>
    </div>
  )
}
