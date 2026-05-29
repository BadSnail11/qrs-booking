import logging
import sys

from reservation_sms_service import send_due_reservation_reminders_all_restaurants
from sms_service import sms_enabled

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)


def main():
    stats = send_due_reservation_reminders_all_restaurants()
    print(
        "SMS reminder run: "
        f"sms_enabled={stats['runs'][0]['sms_enabled'] if stats['runs'] else sms_enabled()} "
        f"restaurants={stats['restaurants']} "
        f"candidates={stats['candidates']} "
        f"sent={stats['sent']} "
        f"skipped={stats['skipped']}"
    )
    for run in stats["runs"]:
        print(
            f"  restaurant_id={run['restaurant_id']} "
            f"now={run.get('now')} tz={run.get('tz')} "
            f"candidates={run['candidates']} sent={run['sent']}"
        )


if __name__ == "__main__":
    main()
