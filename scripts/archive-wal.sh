#!/usr/bin/env sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: archive-wal.sh <source-path> <wal-file-name>" >&2
  exit 64
fi

source_path="$1"
wal_name="$2"
archive_dir="${WAL_ARCHIVE_DIR:-/var/lib/postgresql/wal-archive}"

case "$wal_name" in
  ''|*/*|*..*)
    echo "invalid WAL archive file name" >&2
    exit 64
    ;;
esac

if [ ! -f "$source_path" ] || [ ! -d "$archive_dir" ]; then
  echo "WAL source or archive directory is unavailable" >&2
  exit 1
fi

target_path="$archive_dir/$wal_name"
temporary_path="$archive_dir/.${wal_name}.$$"

cleanup() {
  rm -f "$temporary_path"
}
trap cleanup EXIT HUP INT TERM

if [ -e "$target_path" ]; then
  if cmp -s "$source_path" "$target_path"; then
    exit 0
  fi
  echo "refusing to overwrite a different archived WAL file: $wal_name" >&2
  exit 1
fi

cp "$source_path" "$temporary_path"
chmod 0600 "$temporary_path"

# A hard link makes publication atomic on the same archive filesystem. If a
# concurrent archiver won the race, accept it only when the bytes are equal.
if ln "$temporary_path" "$target_path" 2>/dev/null; then
  exit 0
fi

if [ -e "$target_path" ] && cmp -s "$source_path" "$target_path"; then
  exit 0
fi

echo "failed to publish archived WAL file safely: $wal_name" >&2
exit 1
