import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Step = 'idea' | 'topic' | 'outline'

export default function WizardStepper() {
  const [currentStep, setCurrentStep] = useState<Step>('idea')

  const steps: { id: Step; label: string; index: number }[] = [
    { id: 'idea', label: 'Idea', index: 0 },
    { id: 'topic', label: 'Topic & Critic', index: 1 },
    { id: 'outline', label: 'Outline', index: 2 },
  ]

  const currentStepIndex = steps.find(s => s.id === currentStep)?.index ?? 0

  return (
    <div className="space-y-6">
      {/* Stepper visualization */}
      <div className="flex items-center justify-between">
        {steps.map((step, idx) => (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 font-semibold ${
                  idx <= currentStepIndex
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground text-muted-foreground'
                }`}
              >
                {idx + 1}
              </div>
              <div className="mt-2 text-sm font-medium">{step.label}</div>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 ${
                  idx < currentStepIndex ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content placeholder */}
      <div className="border rounded-lg p-6 min-h-[200px] bg-muted/20">
        <p className="text-muted-foreground">
          Step content for: <strong>{steps[currentStepIndex].label}</strong>
        </p>
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => {
            if (currentStepIndex > 0) {
              setCurrentStep(steps[currentStepIndex - 1].id)
            }
          }}
          disabled={currentStepIndex === 0}
        >
          Previous
        </Button>
        <Button
          onClick={() => {
            if (currentStepIndex < steps.length - 1) {
              setCurrentStep(steps[currentStepIndex + 1].id)
            }
          }}
          disabled={currentStepIndex === steps.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
