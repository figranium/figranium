import TablerIcon from './TablerIcon';
import { TaskOutcome } from '../types';
import { taskOutcomeIcon, taskOutcomeLabel } from '../utils/taskOutcome';

interface OutcomeIconProps {
    outcome: TaskOutcome;
    className?: string;
}

const OutcomeIcon: React.FC<OutcomeIconProps> = ({ outcome, className = 'text-xl' }) => {
    const icon = taskOutcomeIcon(outcome);
    const label = taskOutcomeLabel(outcome);

    return (
        <span role="img" aria-label={label} title={label} className="inline-flex items-center justify-center">
            <TablerIcon name={icon.name} className={`${className} ${icon.className}`} />
            <span className="sr-only">{label}</span>
        </span>
    );
};

export default OutcomeIcon;
