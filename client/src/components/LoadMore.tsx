// The bottom of a paged list: a "Load more" button, a spinner, or nothing
function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (loading) {
    return (
      <div className="text-center py-3">
        <span className="spinner-border spinner-border-sm" role="status" aria-label="Loading"></span>
      </div>
    );
  }
  if (!hasMore) return null;
  return (
    <div className="text-center py-3">
      <button type="button" className="btn btn-outline-primary" onClick={onClick}>
        Load more
      </button>
    </div>
  );
}

export default LoadMore;
