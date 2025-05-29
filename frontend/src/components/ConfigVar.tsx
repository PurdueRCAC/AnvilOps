import { Input } from '@/components/ui/input';

export default function ConfigVar({ name, value, namePlaceholder, valuePlaceholder, secret=false} : {
    name: string,
    value: string,
    namePlaceholder?: string,
    valuePlaceholder?: string,
    secret?: boolean
}) {
    return <div>
        <Input type='input' value={name} placeholder={namePlaceholder} className='w-32 inline-block'/>
        <Input type={secret ? 'password' : 'input'} value={value} placeholder={valuePlaceholder} className='w-32 inline-block'/>
    </div>
}