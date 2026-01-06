import { useState } from 'react';
import { toast } from 'sonner';

interface ActionTriggerOptions {
    onSuccess?: (result: any) => void;
    successMessage?: string;
    errorMessage?: string;
}

export function useActionTrigger() {
    const [isLoading, setIsLoading] = useState(false);

    const trigger = async (
        action: () => Promise<any>,
        options: ActionTriggerOptions = {}
    ) => {
        setIsLoading(true);
        try {
            const promise = action();

            toast.promise(promise, {
                loading: 'Executing command...',
                success: (result) => {
                    // Handle both raw Responses and our internal result objects
                    if (result && typeof result === 'object' && 'success' in result) {
                        if (!result.success) {
                            throw new Error(result.message || 'Action failed');
                        }
                    }

                    options.onSuccess?.(result);
                    return options.successMessage || 'Command executed successfully';
                },
                error: (err) => {
                    return err instanceof Error ? err.message : (options.errorMessage || 'Failed to execute command');
                }
            });

            await promise;
            return true;
        } catch (e) {
            console.error('Action failed:', e);
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    return { trigger, isLoading };
}
