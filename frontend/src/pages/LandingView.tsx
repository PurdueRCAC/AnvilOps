import { Button } from "@/components/ui/button";
import { AppWindow, GitCommit, Hammer } from "lucide-react";
import { Link } from "react-router-dom";

export default function LandingView() {
  return (
    <div className="mx-auto max-w-7xl my-10">
      <h1 className="text-4xl font-bold mb-4">
        Deploy your app in{" "}
        <span className="underline decoration-[4px] decoration-gold">
          seconds
        </span>
        .
      </h1>
      <p>
        AnvilOps helps you deploy your app to Anvil Composable without writing
        Kubernetes manifests.
      </p>
      <Link to="/create-app" className="inline-block mt-8">
        <Button>Deploy Now</Button>
      </Link>

      <h1 className="text-4xl font-bold mb-4">Seamless Git Integration</h1>
      <div className="grid grid-cols-[1.5rem,1.5rem] gap-4 max-w-xl">
        <p className="flex gap-2">
          <GitCommit /> Push a commit to your Git repository
        </p>
        <p className="flex gap-2">
          <Hammer /> AnvilOps builds a container image from your code
        </p>
        <p className="flex gap-2">
          <AppWindow /> Your app is automatically deployed in the Anvil
          Composable cluster with a public subdomain
        </p>
      </div>

      <h1 className="text-4xl font-bold mb-4">
        Kubernetes is hard. Let us handle it for you.
      </h1>
      {/* Show all the manifests needed to deploy an app and explain how annoying it is */}

      <h1 className="text-4xl font-bold mb-4">
        The benefits of Kubernetes without the hassle
      </h1>
      {/* Say that we use Kubernetes because of how robust, resilient, and scalable it is. */}

      <h1 className="text-4xl font-bold mb-4">
        Monitor and rollback your deployments
      </h1>
      {/* Each Git push creates a new deployment with a copy of the previous one's configuration. A deployment captures all the configuration needed to run your app. Roll back to a previous deployment at any time. */}

      <h1 className="text-4xl font-bold mb-4">Bring your repository as-is</h1>
      {/* We use Railpack to build your app without a Dockerfile. (List the supported languages and frameworks) */}

      {/* CTA section at the bottom */}
    </div>
  );
}
