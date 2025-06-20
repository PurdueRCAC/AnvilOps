import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { AppWindow, GitCommit, Hammer } from "lucide-react";
import { Link } from "react-router-dom";

export default function LandingView() {
  return (
    <div className="mx-auto max-w-4xl my-10">
      <h1 className="text-4xl font-bold mb-4 mt-16">
        Deploy your app in{" "}
        <span className="underline decoration-[4px] decoration-gold">
          seconds
        </span>
        .
      </h1>
      <p>
        AnvilOps lets you deploy your app to Anvil Composable without writing
        Kubernetes manifests.
      </p>
      <Link to="/create-app" className="inline-block mt-8">
        <Button>Deploy Now</Button>
      </Link>

      <h1 className="text-4xl font-bold mb-4 mt-16">
        Seamless Git Integration
      </h1>
      <p className="mb-8">
        AnvilOps continuously keeps your deployment in sync with your Git
        repository. <br />
        Here's how it works:
      </p>
      <div className="relative flex flex-col gap-12">
        <div className="absolute start-[calc(1rem-1px)] bg-gold -z-50 inset-y-0 w-0.5 my-6" />
        <div className="flex gap-4 items-center">
          <div className="size-8 rounded-full bg-gold flex items-center justify-center">
            1
          </div>
          <p>
            <GitCommit size={32} /> You push a commit to your Git repository
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="size-8 rounded-full bg-gold flex items-center justify-center">
            2
          </div>
          <p>
            <Hammer size={32} /> AnvilOps builds a container image from your
            code
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="size-8 rounded-full bg-gold flex items-center justify-center">
            3
          </div>
          <p>
            <AppWindow size={32} /> Your app is automatically deployed in the
            Anvil Composable cluster
          </p>
        </div>
      </div>

      <h1 className="text-4xl font-bold mb-4 mt-16">
        Kubernetes is hard. Let us handle it for you.
      </h1>
      <div className="grid grid-cols-2 max-w-4xl gap-4">
        <div className="rounded-md bg-gray-50 border border-input p-4">
          <h3 className="text-lg font-bold">Without AnvilOps</h3>
          <ol className="list-decimal pl-4 space-y-1 mt-2">
            <li>Install Docker and kubectl</li>
            <li>Create a Dockerfile</li>
            <li>Build and tag the Docker image</li>
            <li>Set up a container registry and log in</li>
            <li>Push the image to the registry</li>
            <li>Create Deployment, Service, and Ingress configurations</li>
            <li>Apply configurations to your cluster</li>
          </ol>
        </div>
        <div className="rounded-md bg-gray-50 border border-input p-4">
          <h3 className="text-lg font-bold">With AnvilOps</h3>
          <ol className="list-decimal pl-4 space-y-1 mt-2">
            <li>Sign in to AnvilOps</li>
            <li>Connect your GitHub organization</li>
            <li>Fill in a few details about your app</li>
            <li>That's it! 🥳</li>
          </ol>
        </div>
      </div>

      <h1 className="text-4xl font-bold mb-4 mt-16">
        Monitor and rollback your deployments
      </h1>
      {/* Each Git push creates a new deployment with a copy of the previous one's configuration. A deployment captures all the configuration needed to run your app. Roll back to a previous deployment at any time. */}

      <h1 className="text-4xl font-bold mb-4 mt-16">
        Bring your repository as-is
      </h1>
      {/* We use Railpack to build your app without a Dockerfile. (List the supported languages and frameworks) */}

      <h1 className="text-4xl font-bold mb-4 mt-16">FAQs</h1>
      <Accordion type="single" collapsible>
        <AccordionItem value="q1">
          <AccordionTrigger className="font-bold">
            What is the Anvil Composable Subsystem?
          </AccordionTrigger>
          <AccordionContent className="text-pretty p-4">
            Anvil Composable Subsystem is a Kubernetes based private cloud
            managed with Rancher that provides a platform for creating
            composable infrastructure on demand. This cloud-style flexibility
            provides researchers the ability to self-deploy and manage
            persistent services to complement HPC workflows and run
            container-based data analysis tools and applications.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="q2">
          <AccordionTrigger className="font-bold">
            What languages and frameworks are supported?
          </AccordionTrigger>
          <AccordionContent className="text-pretty p-4">
            Any application with a Dockerfile is supported. We also support
            zero-configuration deployments from every language and framework
            that{" "}
            <a className="font-medium underline" href="https://railpack.com/">
              Railpack
            </a>{" "}
            supports, including Node.js (including Next.js, Remix, Vite, Astro,
            Nuxt, and Angular), Python (including Django), Go, PHP (including
            Laravel), HTML, Java (including Spring Boot), Ruby, Deno, Rust,
            Elixir, and shell scripts.
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* CTA section at the bottom */}
    </div>
  );
}
