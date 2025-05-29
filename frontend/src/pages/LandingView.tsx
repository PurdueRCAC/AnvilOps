import { Button } from "@/components/ui/button";

export default function LandingView() {
    return <div className="w-screen h-screen flex flex-col">
        <h1 className='text-2xl'>AnvilOps</h1>
        <p>The Anvil Composable Subsystem is a Kubernetes based private cloud managed with Rancher that
            provides a platform for creating composable infrastructure on ...</p>
        <a href='/sign-up'><Button>Deploy Now</Button></a>
    </div>
}