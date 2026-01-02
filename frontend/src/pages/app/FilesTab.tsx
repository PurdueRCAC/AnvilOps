import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { isWorkloadConfig } from "@/lib/utils";
import {
  ArrowUp,
  CloudUpload,
  Container,
  Download,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  HardDrive,
  Loader,
  Plus,
  RefreshCw,
  SaveIcon,
  Trash,
  UploadCloud,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { App } from "./AppView";

function dirname(path: string) {
  if (path === "/") {
    return "/";
  }
  if (path.endsWith("/")) {
    // Remove the base name and the trailing slash
    const stripped = path.substring(0, path.lastIndexOf("/")); // Remove the trailing slash
    return stripped.substring(0, stripped.lastIndexOf("/") + 1); // Remove content after the second-last trailing slash
  }

  // Remove the base name
  return path.substring(0, path.lastIndexOf("/") + 1);
}

export const FilesTab = ({ app }: { app: App }) => {
  if (!isWorkloadConfig(app.config)) {
    return (
      <div className="text-center py-8">
        <p>File browser is not available for Helm-based apps.</p>
      </div>
    );
  }

  const [replica, setReplica] = useState("0");
  const [volume, setVolume] = useState<string | undefined>(
    app.config.mounts?.[0]?.volumeClaimName,
  );

  const [pathInput, setPathInput] = useState("/");
  const [path, setPath] = useState(pathInput);

  useEffect(() => {
    setPathInput(path);
  }, [path]);

  const params = {
    params: {
      path: { appId: app.id },
      query: {
        path: path,
        volumeClaimName: `${volume}-${app.name}-${replica}`,
      },
    },
  };

  const {
    data: files,
    isPending: filesLoading,
    refetch: refreshFiles,
    isRefetching,
  } = api.useQuery("get", "/app/{appId}/file", params, {
    enabled: volume !== undefined,
  });

  const goUp = () => {
    setPath(dirname(path));
  };

  const CreateOptions = () => (
    <>
      <FileUpload
        app={app}
        parentDir={path}
        volumeClaimName={params.params.query.volumeClaimName}
        refresh={refreshFiles}
      >
        <div className="w-full flex gap-2 items-center hover:bg-gray-100 p-2 cursor-pointer">
          <Button>
            <UploadCloud /> Upload Files...
          </Button>
        </div>
      </FileUpload>
      <CreateFile
        type="file"
        app={app}
        parentDir={path}
        volumeClaimName={params.params.query.volumeClaimName}
        onComplete={refreshFiles}
      >
        <div className="w-full flex gap-2 items-center hover:bg-gray-100 p-2 cursor-pointer">
          <Button>
            <FilePlus /> Create New File...
          </Button>
        </div>
      </CreateFile>
      <CreateFile
        type="directory"
        app={app}
        parentDir={path}
        volumeClaimName={params.params.query.volumeClaimName}
        onComplete={refreshFiles}
      >
        <div className="w-full flex gap-2 items-center hover:bg-gray-100 p-2 cursor-pointer">
          <Button>
            <FolderPlus /> Create New Folder...
          </Button>
        </div>
      </CreateFile>
    </>
  );

  return (
    <>
      <h2 className="text-xl font-medium">Browse Files</h2>
      <p className="mb-6 opacity-50 text-sm">
        Select a replica and volume to browse.
      </p>
      <div className="grid grid-cols-[max-content_max-content_1fr] gap-4">
        <Label htmlFor="selectReplica">Replica</Label>
        <Label htmlFor="selectVolume">Volume</Label>
        <Label htmlFor="selectVolume">Path</Label>
        <Select name="replica" value={replica} onValueChange={setReplica}>
          <SelectTrigger id="selectReplica">
            <Container />
            <SelectValue placeholder="Select Replica..." />
          </SelectTrigger>
          <SelectContent>
            {Array({ length: app.config.replicas }).map((_, index) => (
              <SelectItem key={index} value={index.toString()}>
                {app.name + "-" + index.toString()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={volume} onValueChange={setVolume}>
          <SelectTrigger id="selectVolume">
            <HardDrive />
            <SelectValue placeholder="Select Volume..." />
          </SelectTrigger>
          <SelectContent>
            {app.config.mounts.map((mount) => (
              <SelectItem key={mount.path} value={mount.volumeClaimName!}>
                {mount.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPath(pathInput);
          }}
        >
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.currentTarget.value)}
            placeholder="/"
          />
          <Button onClick={goUp} variant="secondary">
            <ArrowUp />
          </Button>
          <Button onClick={() => refreshFiles()} variant="secondary">
            <RefreshCw className={isRefetching ? "animate-spin" : ""} />
          </Button>
          <Button type="submit">Go</Button>
        </form>
      </div>
      {filesLoading ? (
        <>
          {volume !== undefined && (
            <div className="flex items-center justify-center min-h-96">
              <Loader className="animate-spin" />
            </div>
          )}
        </>
      ) : files?.type === "file" ? (
        <div className="flex flex-col items-center justify-center mt-4">
          <FilePreview
            key={files.modifiedAt} // Refetch the file if it's modified
            file={files}
            app={app}
            path={path}
            volumeClaimName={params.params.query.volumeClaimName}
            refresh={refreshFiles}
            goUp={goUp}
          />
        </div>
      ) : files?.type === "directory" ? (
        <div className="flex flex-col gap-1 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl">{path}</p>
              <p className="opacity-50">
                Folder &middot; {files?.files?.length ?? 0} files
              </p>
            </div>
            <div className="flex gap-2">
              <DeleteFile
                app={app}
                path={path}
                onComplete={() => {
                  refreshFiles();
                  goUp();
                }}
                volumeClaimName={params.params.query.volumeClaimName}
              >
                <Button variant="outline">
                  <Trash />
                </Button>
              </DeleteFile>
            </div>
          </div>
          <hr className="mt-2 mb-4" />
          {(files?.files?.length ?? 0) === 0 ? (
            <>
              <div className="p-8 my-4 rounded-xl bg-gray-100 flex flex-col items-center gap-2">
                <Folder size={48} />
                <h3 className="text-xl mt-4">No files found</h3>
                <div className="flex gap-2">
                  <Button onClick={goUp} variant="outline">
                    Go back
                  </Button>
                </div>
              </div>
            </>
          ) : (
            files?.files?.map((file) => (
              <div
                key={path + file.name}
                className="flex gap-2 items-center hover:bg-gray-100 p-2 cursor-pointer"
                onClick={() => {
                  setPath(
                    path.endsWith("/")
                      ? path + file.name
                      : path + "/" + file.name,
                  );
                }}
              >
                {file.isDirectory ? (
                  <Folder className="opacity-50" />
                ) : (
                  <File className="opacity-50" />
                )}
                {file.name}
              </div>
            ))
          )}
          <CreateOptions />
        </div>
      ) : null}
    </>
  );
};

const LazyEditor = lazy(() =>
  import("../../lib/monaco").then((module) => ({ default: module.Editor })),
);

const FilePreview = ({
  file,
  path,
  volumeClaimName,
  app,
  refresh,
  goUp,
}: {
  file: { name?: string; fileType?: string; size?: number };
  path: string;
  volumeClaimName: string;
  app: App;
  refresh: () => void;
  goUp: () => void;
}) => {
  const [raw, setRaw] = useState(false);

  const downloadURL = `/api/app/${app.id}/file/download?path=${encodeURIComponent(path)}&volumeClaimName=${encodeURIComponent(volumeClaimName)}`;

  const [content, setContent] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const [shouldDownload, setShouldDownload] = useState(false);

  useEffect(() => {
    if (shouldDownload && content === undefined && !loading && !error) {
      setLoading(true);
      fetch(downloadURL)
        .then((response) => response.text())
        .then((text) => {
          setContent(text);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    }
  }, [shouldDownload]);

  const requestDownload = () => {
    if (!shouldDownload) setShouldDownload(true);
  };

  const Header = ({ children }: { children?: ReactNode }) => (
    <>
      <div className="flex items-center justify-between w-full">
        <div>
          <p className="text-xl">{file.name}</p>
          <p className="opacity-50">
            {file.fileType} &middot; {formatFileSize(file.size!)}
          </p>
        </div>
        <div className="flex gap-2">
          {children}
          <DeleteFile
            app={app}
            path={path}
            onComplete={() => {
              refresh();
              goUp();
            }}
            volumeClaimName={volumeClaimName}
          >
            <Button variant="outline">
              <Trash />
            </Button>
          </DeleteFile>
          <a href={downloadURL}>
            <Button variant="outline">
              <Download />
            </Button>
          </a>
        </div>
      </div>
      <hr className="mt-2 mb-4" />
    </>
  );

  if (file.size! > 10_000_000) {
    // Large files can't be previewed
    return (
      <div className="mt-24 flex flex-col items-center justify-center">
        <File size={48} />
        <p className="mt-2 text-xl">{file.name}</p>
        <p className="mt-1 opacity-50">{file.fileType}</p>
        <div className="bg-gray-100 mt-8 rounded-xl p-4 flex items-center justify-between gap-6">
          <p>This file is too large to be previewed.</p>
          <a href={downloadURL}>
            <Button>Download</Button>
          </a>
        </div>
      </div>
    );
  }

  const [editorContent, setEditorContent] = useState(content);
  const [editorVisible, setEditorVisible] = useState(false);
  const [saved, setSaved] = useState(true);

  const save = async () => {
    const uploadURL = `/api/app/${app.id}/file?volumeClaimName=${encodeURIComponent(volumeClaimName)}&path=${encodeURIComponent(dirname(path))}`;
    const formData = new FormData();
    formData.set("type", "file");
    const blob = new Blob([editorContent!], { type: "text/plain" });
    formData.set("files", blob, file.name);
    setSaving(true);
    try {
      await fetch(uploadURL, { method: "POST", body: formData });
      toast.success("File saved!");
      setSaved(true);
    } catch (e) {
      console.error(e);
      toast.error("There was a problem saving the file!");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (content && !editorContent) {
      setEditorContent(content);
    }
  }, [content, editorContent]);

  useEffect(() => {
    if (!saved) {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }
  }, [saved]);

  useEffect(() => {
    if (editorVisible) {
      const handler = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === "s") {
          e.preventDefault();
          save();
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
  }, [editorVisible]);

  const [saving, setSaving] = useState(false);

  if (raw || isTextFile(file.fileType!, file.name!)) {
    requestDownload();
    return (
      <div className="w-full">
        <Header>
          <Button disabled={saving} onClick={save}>
            {saving ? (
              <>
                <Loader className="animate-spin" /> Saving...
              </>
            ) : (
              <>
                <SaveIcon /> Save
              </>
            )}
          </Button>
        </Header>
        {loading ? (
          <Loader className="animate-spin" />
        ) : (
          <Suspense fallback={<Loader className="animate-spin" />}>
            {/* ^ This Suspense boundary is triggered when the JavaScript bundle for the Editor component is loading */}
            <LazyEditor
              loading={<Loader className="animate-spin" />}
              onMount={() => setEditorVisible(true)}
              defaultLanguage={file.fileType}
              value={editorContent}
              onChange={(content) => {
                setEditorContent(content);
                setSaved(false);
              }}
              className="min-h-200"
            />
          </Suspense>
        )}
      </div>
    );
  }

  if (file.fileType?.startsWith("image/")) {
    return (
      <div className="w-full">
        <Header />
        <img src={downloadURL} />
      </div>
    );
  }

  return (
    <>
      <Header />
      <div className="flex flex-col items-center justify-center mt-24">
        <File size={48} />
        <p className="mt-2 text-xl">{file.name}</p>
        <p className="mt-1 opacity-50">{file.fileType}</p>
        <div className="bg-gray-100 mt-8 rounded-xl p-4">
          <p>We can't preview this file type.</p>
          <Button
            variant="outline"
            className="mt-4 mr-4"
            onClick={() => setRaw(true)}
          >
            View Raw
          </Button>
          <a href={downloadURL}>
            <Button>Download</Button>
          </a>
        </div>
      </div>
    </>
  );
};

const DeleteFile = ({
  app,
  path,
  volumeClaimName,
  children,
  onComplete,
}: {
  app: App;
  path: string;
  volumeClaimName: string;
  children: ReactNode;
  onComplete: () => void;
}) => {
  const { mutateAsync: deleteFile, isPending } = api.useMutation(
    "delete",
    "/app/{appId}/file",
  );

  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete File</DialogTitle>
        </DialogHeader>
        <p>
          Are you sure you want to delete <code>{path}</code>? This cannot be
          undone.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await deleteFile({
                params: {
                  path: { appId: app.id },
                  query: { volumeClaimName, path },
                },
              });
              onComplete();
              setOpen(false);
            } catch (e) {
              console.error(e);
              toast.error("There was a problem deleting the file.");
            }
          }}
        >
          <div className="flex justify-end mt-4">
            <Button type="submit" disabled={isPending}>
              <Trash /> Delete Forever
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const CreateFile = ({
  type,
  app,
  parentDir,
  volumeClaimName,
  children,
  onComplete,
}: {
  type: "file" | "directory";
  app: App;
  parentDir: string;
  volumeClaimName: string;
  children: ReactNode;
  onComplete: () => void;
}) => {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const { mutateAsync: createFile, isPending } = api.useMutation(
    "post",
    "/app/{appId}/file",
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Create {type === "file" ? "File" : "Folder"}
          </DialogTitle>{" "}
          <p>
            Located in <code>{parentDir}</code>
          </p>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();

            const files = new Blob([""], { type: "text/plain" });
            const formData = new FormData();
            if (type === "file") {
              formData.set("files", files, name);
            }
            formData.set("type", type);

            const promise = createFile({
              params: {
                path: { appId: app.id },
                query: {
                  path:
                    type === "file"
                      ? parentDir
                      : parentDir.endsWith("/")
                        ? parentDir + name
                        : parentDir + "/" + name,
                  volumeClaimName,
                },
              },
              body: formData as unknown as any,
            }).then(onComplete);
            toast.promise(promise, {
              success: `${type === "file" ? "File" : "Folder"} created successfully!`,
              error: `There was a problem creating the ${type === "file" ? "file" : "folder"}.`,
              loading: `Creating ${type === "file" ? "file" : "folder"}...`,
            });
          }}
        >
          <Label htmlFor="createFileName">Name</Label>
          <Input
            id="createFileName"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <div className="flex justify-end mt-4">
            <Button type="submit" disabled={isPending}>
              <Plus /> Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const FileUpload = ({
  app,
  parentDir,
  volumeClaimName,
  children,
  refresh,
}: {
  app: App;
  parentDir: string;
  volumeClaimName: string;
  children: ReactNode;
  refresh: () => void;
}) => {
  const uploadURL = `/api/app/${app.id}/file?volumeClaimName=${encodeURIComponent(volumeClaimName)}&path=${encodeURIComponent(parentDir)}`;

  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
        </DialogHeader>
        <p>
          Files will be placed in <code>{parentDir}</code>.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const promise = fetch(uploadURL, {
              method: "POST",
              body: formData,
            })
              .then(() => {
                refresh();
                setOpen(false);
              })
              .catch(console.error);
            toast.promise(promise, {
              success: "Files uploaded successfully!",
              error: "There was a problem uploading files.",
              loading: "Uploading files...",
            });
          }}
        >
          <input type="hidden" name="type" value="file" />
          <input type="hidden" name="basePath" value={parentDir} />
          <Input type="file" name="files" multiple />
          <div className="flex justify-end mt-4">
            <Button type="submit">
              <CloudUpload /> Upload
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1000) {
    return `${bytes} bytes`;
  } else if (bytes < 1_000_000) {
    return `${Math.round(bytes / 1000)} kB`;
  } else if (bytes < 1_000_000_000) {
    return `${Math.round(bytes / 1_000_000)} MB`;
  } else {
    return `${Math.round(bytes / 1_000_000_000)} GB`;
  }
};

const isTextFile = (fileType: string, fileName: string) =>
  fileType.startsWith("text/") ||
  ["application/json"].includes(fileType) ||
  [".env", ".properties"].some((extension) => fileName.endsWith(extension));
