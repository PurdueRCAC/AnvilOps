import { Button } from "@/components/ui/button";

export default function LandingView() {
  return (
    <div className="w-screen h-screen flex flex-col justify-center items-center">
      <h1 className="text-2xl">AnvilOps</h1>
      <p>
        Anvil Composable Subsystem is a Kubernetes based private cloud managed
        with Rancher that provides a platform for creating composable
        infrastructure on demand. This cloud-style flexibility provides
        researchers the ability to self-deploy and manage persistent services to
        complement HPC workflows and run container-based data analysis tools and
        applications.
      </p>
      <a href="/sign-in">
        <Button>Deploy Now</Button>
      </a>
    </div>
  );
}
