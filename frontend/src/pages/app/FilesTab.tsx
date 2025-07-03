import { Button } from "@/components/ui/button";
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
import {
  ArrowUp,
  Container,
  File,
  Folder,
  HardDrive,
  Loader,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { App } from "./AppView";

export const FilesTab = ({ app }: { app: App }) => {
  const [replica, setReplica] = useState("0");
  const [volume, setVolume] = useState<string | undefined>(
    app.config.mounts?.[0]?.volumeClaimName,
  );

  const [pathInput, setPathInput] = useState("/");
  const [path, setPath] = useState(pathInput);

  useEffect(() => {
    console.log("path changed to", path);
    setPathInput(path);
  }, [path]);

  console.log({ path, pathInput });

  const params = {
    params: {
      path: { appId: app.id },
      query: {
        path: path,
        volumeClaimName: `${volume}-${app.name}-${replica}`,
      },
    },
  };

  const { data: files, isPending: filesLoading } = api.useQuery(
    "get",
    "/app/{appId}/file",
    params,
    { enabled: volume !== undefined },
  );

  const goUp = () => {
    console.log(path);
    if (path === "/") {
      return;
    }
    if (path.endsWith("/")) {
      // Remove the base name and the trailing slash
      const stripped = path.substring(0, path.lastIndexOf("/")); // Remove the trailing slash
      setPath(stripped.substring(0, stripped.lastIndexOf("/") + 1)); // Remove content after the second-last trailing slash
      return;
    }

    // Remove the base name
    setPath(path.substring(0, path.lastIndexOf("/") + 1));
  };

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
        <div className="flex gap-2">
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.currentTarget.value)}
            placeholder="/"
          />
          <Button onClick={goUp} variant="secondary">
            <ArrowUp />
          </Button>
          <Button onClick={() => setPath(pathInput)}>Go</Button>
        </div>
      </div>
      {filesLoading ? (
        <div className="flex items-center justify-center min-h-96">
          <Loader className="animate-spin" />
        </div>
      ) : files?.type === "file" ? (
        <div className="flex flex-col items-center justify-center min-h-96">
          <FilePreview file={files!} />
        </div>
      ) : files?.type === "directory" && (files?.files?.length ?? 0) > 0 ? (
        <div className="flex flex-col gap-1 mt-4">
          {files?.files?.map((file) => (
            <div
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
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-96">
          <div className="p-16 rounded-xl bg-gray-100 flex flex-col items-center gap-2">
            <Folder size={48} />
            <h3 className="text-xl mt-4">No files found</h3>
            <Button onClick={goUp}>Go back</Button>
          </div>
        </div>
      )}
    </>
  );
};

const FilePreview = ({
  file,
}: {
  file: { name?: string; fileType?: string };
}) => {
  return (
    <>
      <File size={48} />
      <p>{file.name}</p>
      <p>{file.fileType}</p>
    </>
  );
};
