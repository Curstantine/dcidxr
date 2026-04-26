package env

import (
	"errors"
	"io/fs"
	"os"

	"github.com/joho/godotenv"
)

func Load() error {
	for _, path := range []string{".env.local", ".env"} {
		if _, err := os.Stat(path); err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			return err
		}

		if err := godotenv.Load(path); err != nil {
			return err
		}
	}

	return nil
}
